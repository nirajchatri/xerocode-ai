import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Github,
  GitBranch,
  LayoutGrid,
  LayoutTemplate,
  Link2,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Save,
  Share2,
  Square,
  X,
} from 'lucide-react';
import { apiUrl, getStudioAuthHeaders, readApiJson, studioFetch } from '../lib/apiBase';
import { mergeDashboardMetaIntoProposalJson, tryParseDashboardProposal, getProposalDashboardTitle } from '../lib/dashboardDesignProposal';
import { DASHBOARD_DESIGN_TEMPLATES, getDashboardDesignTemplate, templateContextBlock } from '../lib/dashboardDesignTemplates';
import type { CopilotLlmProviderId } from '../lib/copilotLlmCatalog';
import { COPILOT_LLM_PROVIDERS, COPILOT_MODELS_BY_PROVIDER } from '../lib/copilotLlmCatalog';
import { formatAppDataDatasourceLabel, loadAppDataDatasourceList, type AppDataDatasourceItem } from '../lib/loadAppDataDatasourceList';
import { expandSavedApiEndpoints, readSavedApis, type SavedApi } from '../lib/savedApis';
import { readExternalApis, type ExternalApiDefinition } from '../lib/externalApis';
import {
  hasWorkspaceAuth,
  loadBlueprintApisWorkspace,
  loadExternalApisWorkspace,
  migrateLocalBlueprintApisIfRemoteEmpty,
  migrateLocalExternalApisIfRemoteEmpty,
  mirrorBlueprintApisLocal,
  mirrorExternalApisLocal,
} from '../lib/workspaceApis';
import {
  fetchBlueprintSavedList,
  fetchExternalSavedApi,
  normalizePayloadToRecords,
  tryIssueBlueprintBearerJwt,
} from '../lib/designStudioApiLiveFetch';
import { DESIGN_STUDIO_REMOTE_PAYLOAD_KIND, saveDesignStudioDashboard } from '../lib/designStudioSavedDashboards';
import { DashboardProposalVisualPreview, type DesignStudioLiveDataset } from './DashboardProposalVisualPreview';
import { PostmanStyleJsonViewer } from './PostmanStyleJsonViewer';
import { StudioPopoverSelect, type StudioPopoverSelectSection } from './StudioPopoverSelect';

export type DashboardDesignStudioScreenProps = {
  isDarkMode: boolean;
  llmProvider: CopilotLlmProviderId;
  llmModel: string;
  llmProviderLabel: string;
  llmModelLabel: string;
  workspacePrompt: string;
  workspaceDataSourceLabel: string;
  onBack: () => void;
  /** Optional bootstrap from Design Studio landing */
  initialSuggestedApiRef?: string;
  initialSelectedDatasourceKey?: string;
  initialComposeAttachments?: Array<{
    id: string;
    previewUrl: string;
    mimeType: string;
    dataBase64: string;
    name: string;
  }>;
  /** After landing “Build”, auto-run structured proposal generation */
  autoStartBuild?: boolean;
  /** Resume a dashboard loaded from workspace `/api/dashboards` */
  savedRemoteDashboardId?: string | null;
  initialProposalJson?: string | null;
  initialPublishedSlug?: string | null;
};

type ChatMsg = {
  role: 'user' | 'assistant';
  text: string;
  bubbleKind?: 'normal' | 'agent_question' | 'agent_status';
  answered?: boolean;
};

type ComposeAttachment = {
  id: string;
  previewUrl: string;
  mimeType: string;
  dataBase64: string;
  name: string;
};

const WORKSPACE_LLM_VALUE = '__workspace_default__';

function llmChoiceFromSaved(provider: string, modelName: string): string {
  return `saved:${provider}:${modelName}`;
}

function parseSavedLlmChoice(value: string): { provider: CopilotLlmProviderId; model: string } | null {
  if (!value.startsWith('saved:')) return null;
  const rest = value.slice('saved:'.length);
  const idx = rest.indexOf(':');
  if (idx <= 0) return null;
  const provider = rest.slice(0, idx) as CopilotLlmProviderId;
  const model = rest.slice(idx + 1);
  if (!model || !COPILOT_LLM_PROVIDERS.some((p) => p.id === provider)) return null;
  return { provider, model };
}

function formatLlmRowLabel(provider: string, modelName: string): string {
  const pLabel = COPILOT_LLM_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  const mLabel =
    COPILOT_MODELS_BY_PROVIDER[provider as CopilotLlmProviderId]?.find((m) => m.value === modelName)?.label ??
    modelName;
  return `${pLabel} · ${mLabel}`;
}

type LlmConfigApiRow = { provider?: string; model_name?: string; api_key?: string };

const CHAT_SYSTEM_PROMPT = `You are an expert dashboard designer for a product called Dashboard Design Studio.

Your job is to help users define dynamic, interactive dashboards from their data sources (REST APIs or databases).

When the user attaches dashboard mockups or screenshots, you receive the actual image pixels (multimodal input). Study them carefully: header/title blocks, KPI card grids, chart types (line, bar, donut, tables), filters/time toggles, typography hierarchy, spacing, and accent colors. Mirror that layout structure in your structured proposal (titles, component types, and layout_suggestion), swapping in metrics and field bindings that fit their datasource—do not claim you cannot see images.

When the user message includes a "Selected layout template" section, treat it as mandatory spatial guidance: your layout_suggestion and key_metrics_visualizations must realize that template's regions (navigation shell, KPI bands, chart zones, tables), swapping in metrics and bindings appropriate to their datasource.

Behavior:
- Be conversational and concise before there is a dashboard proposal JSON in the bundle.
- When the bundle includes "Current dashboard proposal JSON", treat chat as an iteration loop: if the user asks to change, add, remove, rename, or reorder charts/KPIs/filters/titles/layout/metrics, respond with ONE JSON object ONLY (full updated proposal, same schema — no markdown fences, no prose).
- If requirements are ambiguous (metrics unclear, time grain missing, filters unknown, roles/security unclear, API contract vague, or schema unspecified), ask focused clarifying questions before proposing a full layout — unless the user is editing an existing proposal JSON (then apply reasonable defaults).
- Highlight "dynamic" aspects: cross-filtering, drill-downs, parameterized queries, scheduled/auto refresh, role-based data scopes, and saved views.
- When there is no current proposal yet and the user asks you to finalize, produce the proposal, or when you already have enough detail to propose confidently, respond with ONE JSON object ONLY (no markdown fences, no commentary before or after) using exactly these top-level keys:
  - "dashboard_title" (string)
  - "objective" (string)
  - "data_source" (object): include type, connection or endpoint summary, authentication summary, and extraction/query notes as appropriate
  - "key_metrics_visualizations" (array of objects): each item must include at minimum "id", "type", "title", fields describing data bindings (e.g. "data_field", "x_axis", "y_axis"), "configuration" or specific keys like time aggregation/sort/limit when relevant, and "interactive_features" (array of strings) when applicable
  - "layout_suggestion" (string)
  - "global_filters" (array of objects): each with "name", "type", "applies_to" (array of component ids)
  - "potential_ai_enhancements" (array of strings)

Use realistic placeholders for secrets (never invent real credentials). Prefer snake_case keys to match downstream tooling.`;

const JSON_SYSTEM_PROMPT = `You output only valid JSON for a dashboard design specification.
Use these top-level keys: dashboard_title, objective, data_source, key_metrics_visualizations, layout_suggestion, global_filters, potential_ai_enhancements.
Each visualization entry must include id, type, title, explicit data fields or bindings from the user's source, configuration parameters (aggregation, time grain, limits, sorting), and interactive_features where relevant.
When reference images are attached, you see them—copy their layout (KPI bands, charts, tables, filters, hierarchy) into key_metrics_visualizations and layout_suggestion using bindings appropriate to the user's schema.
If the request includes a selected layout template description, mirror its layout regions and component categories (adapt titles and field bindings to the user's schema).
Never include markdown or prose outside the JSON object.`;

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';

function sampleRowsForLlm(rows: Record<string, unknown>[]): string | null {
  if (!rows.length) return null;
  try {
    let s = JSON.stringify(rows.slice(0, 25), null, 2);
    if (s.length > 14000) s = `${s.slice(0, 14000)}\n… (truncated)`;
    return s;
  } catch {
    return null;
  }
}

export const DashboardDesignStudioScreen: React.FC<DashboardDesignStudioScreenProps> = ({
  isDarkMode,
  llmProvider,
  llmModel,
  llmProviderLabel,
  llmModelLabel,
  workspacePrompt,
  workspaceDataSourceLabel,
  onBack,
  initialSuggestedApiRef,
  initialSelectedDatasourceKey,
  initialComposeAttachments,
  autoStartBuild,
  savedRemoteDashboardId: savedRemoteDashboardIdProp,
  initialProposalJson,
  initialPublishedSlug,
}) => {
  const [savedApisList, setSavedApisList] = useState<SavedApi[]>(() => readSavedApis());
  const [externalApisList, setExternalApisList] = useState<ExternalApiDefinition[]>(() => readExternalApis());
  const [appDataDatasourceList, setAppDataDatasourceList] = useState<AppDataDatasourceItem[]>([]);
  const [appDataDsBusy, setAppDataDsBusy] = useState(false);

  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [selectedDatasourceKey, setSelectedDatasourceKey] = useState<string>('');

  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiAuthSummary, setApiAuthSummary] = useState('');
  const [apiParamsNotes, setApiParamsNotes] = useState('');
  const [dbType, setDbType] = useState('postgresql');
  const [dbConnectionPlaceholder, setDbConnectionPlaceholder] = useState(
    'postgresql://USER:PASSWORD@HOST:5432/DBNAME'
  );
  const [dbTablesNotes, setDbTablesNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [rightTab, setRightTab] = useState<'preview' | 'spec'>('preview');
  const [chatInput, setChatInput] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachment[]>(
    () => initialComposeAttachments?.map((a) => ({ ...a })) ?? []
  );
  const composeImageInputRef = useRef<HTMLInputElement>(null);

  const [proposalPretty, setProposalPretty] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(() =>
    initialPublishedSlug?.trim() ? initialPublishedSlug.trim() : null
  );
  const [remoteSavedDashboardId, setRemoteSavedDashboardId] = useState<string | null>(
    savedRemoteDashboardIdProp?.trim() ? savedRemoteDashboardIdProp.trim() : null
  );
  const [busyKind, setBusyKind] = useState<'idle' | 'chat' | 'json'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handleGenerateJsonRef = useRef<() => Promise<void>>(async () => {});

  const [carouselIdx, setCarouselIdx] = useState(0);

  const [liveApiRows, setLiveApiRows] = useState<Record<string, unknown>[]>([]);
  const [liveApiLoading, setLiveApiLoading] = useState(false);
  const [liveApiError, setLiveApiError] = useState<string | null>(null);
  const [liveApiSourceLabel, setLiveApiSourceLabel] = useState('');

  const [dashboardSaveName, setDashboardSaveName] = useState('');
  const [dashboardObjectiveDraft, setDashboardObjectiveDraft] = useState('');
  const [previewMetaEditOpen, setPreviewMetaEditOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const [llmConfigsWithKey, setLlmConfigsWithKey] = useState<LlmConfigApiRow[]>([]);
  const [llmCatalogLoading, setLlmCatalogLoading] = useState(true);
  const [llmSelectValue, setLlmSelectValue] = useState<string>(WORKSPACE_LLM_VALUE);
  const llmInitialSyncedRef = useRef(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => getDashboardDesignTemplate(selectedTemplateId), [selectedTemplateId]);

  const templateBlockForLlm = useMemo(() => templateContextBlock(selectedTemplate), [selectedTemplate]);

  const refreshApis = useCallback(async () => {
    if (!hasWorkspaceAuth()) {
      setSavedApisList(readSavedApis());
      setExternalApisList(readExternalApis());
      return;
    }
    try {
      await migrateLocalBlueprintApisIfRemoteEmpty();
      await migrateLocalExternalApisIfRemoteEmpty();
      const [bp, ext] = await Promise.all([loadBlueprintApisWorkspace(), loadExternalApisWorkspace()]);
      mirrorBlueprintApisLocal(bp);
      mirrorExternalApisLocal(ext);
      setSavedApisList(bp);
      setExternalApisList(ext);
    } catch {
      setSavedApisList(readSavedApis());
      setExternalApisList(readExternalApis());
    }
  }, []);

  const refreshAppDataDatasources = useCallback(async () => {
    setAppDataDsBusy(true);
    try {
      const list = await loadAppDataDatasourceList();
      setAppDataDatasourceList(list);
    } catch {
      setAppDataDatasourceList([]);
    } finally {
      setAppDataDsBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshApis();
  }, [refreshApis]);

  useEffect(() => {
    void refreshAppDataDatasources();
  }, [refreshAppDataDatasources]);

  useEffect(() => {
    let cancelled = false;
    const loadLlms = async () => {
      setLlmCatalogLoading(true);
      try {
        const res = await studioFetch(apiUrl('/api/llm-config'));
        const data = await readApiJson<{ ok?: boolean; configs?: LlmConfigApiRow[] }>(res);
        const rows = res.ok && data?.ok && Array.isArray(data.configs) ? data.configs : [];
        const withKey = rows.filter((r) => String(r.api_key || '').trim());
        if (!cancelled) {
          setLlmConfigsWithKey(withKey);
        }
      } catch {
        if (!cancelled) setLlmConfigsWithKey([]);
      } finally {
        if (!cancelled) setLlmCatalogLoading(false);
      }
    };
    void loadLlms();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (llmCatalogLoading || llmInitialSyncedRef.current) return;
    llmInitialSyncedRef.current = true;
    const match = llmConfigsWithKey.find(
      (r) =>
        String(r.provider || '').toLowerCase() === llmProvider &&
        String(r.model_name || '').trim() === llmModel.trim()
    );
    if (match) {
      setLlmSelectValue(llmChoiceFromSaved(String(match.provider), String(match.model_name)));
    }
  }, [llmCatalogLoading, llmConfigsWithKey, llmProvider, llmModel]);

  useEffect(() => {
    const raw = initialProposalJson?.trim();
    if (!raw) return;
    const parsed = tryParseDashboardProposal(raw);
    if (parsed) {
      setProposalPretty(parsed.pretty);
      setDashboardSaveName(getProposalDashboardTitle(parsed.json));
      const obj = parsed.json.objective;
      setDashboardObjectiveDraft(typeof obj === 'string' ? obj : '');
    } else {
      setProposalPretty(raw);
    }
    setRightTab('preview');
  }, [initialProposalJson]);

  const resolvedChatLlm = useMemo(() => {
    if (llmSelectValue === WORKSPACE_LLM_VALUE) {
      return {
        provider: llmProvider,
        model: llmModel,
        providerLabel: llmProviderLabel,
        modelLabel: llmModelLabel,
      };
    }
    const parsed = parseSavedLlmChoice(llmSelectValue);
    if (!parsed) {
      return {
        provider: llmProvider,
        model: llmModel,
        providerLabel: llmProviderLabel,
        modelLabel: llmModelLabel,
      };
    }
    const pLab = COPILOT_LLM_PROVIDERS.find((p) => p.id === parsed.provider)?.label ?? parsed.provider;
    const mLab =
      COPILOT_MODELS_BY_PROVIDER[parsed.provider]?.find((m) => m.value === parsed.model)?.label ?? parsed.model;
    return { provider: parsed.provider, model: parsed.model, providerLabel: pLab, modelLabel: mLab };
  }, [llmSelectValue, llmProvider, llmModel, llmProviderLabel, llmModelLabel]);

  const activeHeaderLlmLine = `${resolvedChatLlm.providerLabel} · ${resolvedChatLlm.modelLabel}`;

  const parsedProposal = useMemo(() => {
    if (!proposalPretty.trim()) return null;
    return tryParseDashboardProposal(proposalPretty)?.json ?? null;
  }, [proposalPretty]);

  const previewSlides = useMemo(() => composeAttachments.map((a) => a.previewUrl), [composeAttachments]);

  useEffect(() => {
    setCarouselIdx((i) => {
      const n = composeAttachments.length;
      if (n === 0) return 0;
      return Math.min(i, Math.max(0, n - 1));
    });
  }, [composeAttachments.length]);

  const previewStatusLabel = useMemo(() => {
    if (busyKind === 'json')
      return previewSlides.length > 0 ? 'Scanning reference images & generating specification…' : 'Generating dashboard specification…';
    if (busyKind === 'chat') return 'Agent is running…';
    if (proposalPretty && parsedProposal) return 'Dashboard specification ready';
    return previewSlides.length > 0 ? 'Review reference images — chat to refine' : 'Waiting for proposal or mockups';
  }, [busyKind, proposalPretty, parsedProposal, previewSlides.length]);

  const previewLiveDataset = useMemo<DesignStudioLiveDataset>(
    () => ({
      rows: liveApiRows,
      loading: liveApiLoading,
      error: liveApiError,
      sourceLabel: liveApiSourceLabel,
    }),
    [liveApiRows, liveApiLoading, liveApiError, liveApiSourceLabel]
  );

  useEffect(() => {
    const parsed = tryParseDashboardProposal(proposalPretty);
    if (!parsed) {
      setDashboardSaveName('');
      setDashboardObjectiveDraft('');
      return;
    }
    const { json } = parsed;
    setDashboardSaveName(
      String(json.dashboard_title ?? json.dashboardTitle ?? 'Untitled dashboard').trim() || 'Untitled dashboard'
    );
    setDashboardObjectiveDraft(typeof json.objective === 'string' ? json.objective : '');
  }, [proposalPretty]);

  useEffect(() => {
    if (!saveToast) return;
    const t = window.setTimeout(() => setSaveToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [saveToast]);

  const shareUrlsForSlug = useCallback((slug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const publicUrl = `${origin}/public-design-studio/${encodeURIComponent(slug)}`;
    const embedTarget = `${publicUrl}?embed=1`;
    const embedSnippet = `<iframe src="${embedTarget}" title="Dashboard preview" width="100%" height="640" style="border:0;border-radius:12px;max-width:100%" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    return { publicUrl, embedSnippet };
  }, []);

  const handlePublishPreview = async () => {
    if (!parsedProposal || publishBusy) return;
    const headers = getStudioAuthHeaders();
    if (!headers['x-user-email']) {
      setError('Sign in to publish a shareable preview.');
      return;
    }
    setPublishBusy(true);
    setError(null);
    try {
      const res = await studioFetch(apiUrl('/api/design-studio/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title: String(parsedProposal.dashboard_title ?? parsedProposal.dashboardTitle ?? ''),
          proposal: parsedProposal,
          ...(liveApiRows.length > 0
            ? {
                liveSnapshot: {
                  rows: liveApiRows,
                  sourceLabel: liveApiSourceLabel.trim() || undefined,
                },
              }
            : {}),
        }),
      });
      const data = await readApiJson<{ ok?: boolean; slug?: string; message?: string }>(res);
      if (!res.ok || !data?.ok || !data.slug) {
        throw new Error(data?.message || 'Unable to publish preview.');
      }
      setPublishedSlug(data.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish preview.');
    } finally {
      setPublishBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = publishedSlug
      ? shareUrlsForSlug(publishedSlug).publicUrl
      : `${origin}/public-design-studio/<slug>\n(Publish preview from Spec to replace <slug> with a live link.)`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  const handleCopyEmbed = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = publishedSlug
      ? shareUrlsForSlug(publishedSlug).embedSnippet
      : `<!-- Example after publish — swap YOUR_SLUG: -->\n<iframe src="${origin}/public-design-studio/YOUR_SLUG?embed=1" title="Dashboard preview" width="100%" height="640" style="border:0;border-radius:12px;max-width:100%" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  const clearApiSelection = useCallback(() => {
    setSelectedApiKey('');
    setApiEndpoint('');
    setApiMethod('GET');
    setApiAuthSummary('');
    setApiParamsNotes('');
  }, []);

  const clearDatasourceSelection = useCallback(() => {
    setSelectedDatasourceKey('');
    setDbType('postgresql');
    setDbConnectionPlaceholder('postgresql://USER:PASSWORD@HOST:5432/DBNAME');
    setDbTablesNotes('');
  }, []);

  const applyBlueprintApi = useCallback((api: SavedApi) => {
    setSelectedApiKey(`bp:${api.id}`);
    const base = String(api.publicBaseUrl || '').trim().replace(/\/$/, '');
    const endpoints = expandSavedApiEndpoints(api);
    const first = endpoints[0];
    setApiEndpoint(base || '');
    setApiMethod(first?.method ?? 'GET');
    const pathPreview = endpoints
      .slice(0, 14)
      .map((e) => `${e.method} ${e.path} (${e.scope})`)
      .join('\n');
    setApiAuthSummary(
      [
        `Published blueprint API "${api.name}".`,
        'Calls typically require the datasource Bearer JWT from API Builder → Run when the blueprint is protected.',
        `Backed by saved connection: ${api.connection?.friendly_name || api.connection?.database_name || '—'} (${api.connection?.connector_type || 'db'}).`,
      ].join(' ')
    );
    setApiParamsNotes(pathPreview ? `Sample routes (relative to public base):\n${pathPreview}` : '');
  }, []);

  const applyExternalApi = useCallback((ex: ExternalApiDefinition) => {
    setSelectedApiKey(`ext:${ex.id}`);
    setApiEndpoint(ex.url.trim());
    setApiMethod(ex.method);
    setApiAuthSummary(
      ex.authType === 'bearer'
        ? `Bearer Authorization header (token configured on saved external request "${ex.name}").`
        : `Auth: none (saved external request "${ex.name}").`
    );
    const qp = ex.queryParams.filter((r) => r.key.trim()).map((r) => `${r.key}=${r.value}`);
    setApiParamsNotes(qp.length ? `Query parameters:\n${qp.join('\n')}` : '');
  }, []);

  const applyAppDataDatasource = useCallback((item: AppDataDatasourceItem) => {
    setSelectedDatasourceKey(item.id);
    if (item.kind === 'excel' || item.connector_type === 'excel') {
      setDbType('excel');
      setDbConnectionPlaceholder(`Excel schema "${item.friendly_name}" (saved locally · ${item.id})`);
      setDbTablesNotes(`Sheets/tables from saved Excel schema "${item.friendly_name}".`);
      return;
    }
    const ct = String(item.connector_type || 'postgresql').toLowerCase();
    const numericId = item.id.startsWith('db:') ? item.id.slice(3) : item.id;
    setDbType(ct === 'mongodb' ? 'mongodb' : ct === 'mysql' ? 'mysql' : ct === 'sqlserver' ? 'sqlserver' : 'postgresql');
    setDbConnectionPlaceholder(
      `${item.connector_type || 'database'} · ${item.friendly_name} · ${item.host}:${item.port}/${item.database_name} (saved profile id ${numericId})`
    );
    setDbTablesNotes(`User: ${item.username || '(unknown)'}`);
  }, []);

  useEffect(() => {
    const raw = initialSelectedDatasourceKey?.trim();
    if (!raw) return;
    const item = appDataDatasourceList.find((x) => x.id === raw);
    if (item) applyAppDataDatasource(item);
  }, [initialSelectedDatasourceKey, appDataDatasourceList, applyAppDataDatasource]);

  useEffect(() => {
    const raw = initialSuggestedApiRef?.trim();
    if (!raw) return;
    if (raw.startsWith('bp:')) {
      const id = raw.slice(3);
      const api = savedApisList.find((x) => x.id === id);
      if (api) applyBlueprintApi(api);
      return;
    }
    if (raw.startsWith('ext:')) {
      const id = raw.slice(4);
      const ex = externalApisList.find((x) => x.id === id);
      if (ex) applyExternalApi(ex);
    }
  }, [initialSuggestedApiRef, savedApisList, externalApisList, applyBlueprintApi, applyExternalApi]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveApi() {
      setLiveApiLoading(true);
      setLiveApiError(null);
      setLiveApiRows([]);
      setLiveApiSourceLabel('');
      const key = selectedApiKey.trim();
      if (!key.startsWith('bp:') && !key.startsWith('ext:')) {
        setLiveApiLoading(false);
        return;
      }
      try {
        if (key.startsWith('bp:')) {
          const id = key.slice(3);
          const api = savedApisList.find((a) => a.id === id);
          if (!api) throw new Error('Blueprint API not found in workspace.');
          const cid = api.connection?.id;
          if (cid !== undefined && cid !== null && Number.isFinite(Number(cid))) {
            await tryIssueBlueprintBearerJwt(Number(cid));
          }
          const raw = await fetchBlueprintSavedList(api);
          const rows = normalizePayloadToRecords(raw);
          if (!cancelled) {
            setLiveApiRows(rows);
            setLiveApiSourceLabel(api.name);
          }
        } else {
          const id = key.slice(4);
          const ex = externalApisList.find((x) => x.id === id);
          if (!ex) throw new Error('External API not found.');
          const raw = await fetchExternalSavedApi(ex);
          const rows = normalizePayloadToRecords(raw);
          if (!cancelled) {
            setLiveApiRows(rows);
            setLiveApiSourceLabel(ex.name);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLiveApiError(e instanceof Error ? e.message : 'Failed to fetch API data for preview.');
        }
      } finally {
        if (!cancelled) setLiveApiLoading(false);
      }
    }
    void loadLiveApi();
    return () => {
      cancelled = true;
    };
  }, [selectedApiKey, savedApisList, externalApisList]);

  const dataSpecSummary = useMemo(() => {
    const apiBlock = [
      '--- Saved API (when selected) ---',
      selectedApiKey ? 'Selection: active' : 'No saved API selected from dropdown.',
      `Endpoint / base: ${apiEndpoint.trim() || '(not set)'}`,
      `Method: ${apiMethod}`,
      `Authentication / headers: ${apiAuthSummary.trim() || '(not specified)'}`,
      `Parameters / routes notes: ${apiParamsNotes.trim() || '(not specified)'}`,
    ].join('\n');

    const dsBlock = [
      '--- App Data datasource (when selected) ---',
      selectedDatasourceKey ? `Selection id: ${selectedDatasourceKey}` : 'No datasource selected from dropdown.',
      `Engine or kind: ${dbType}`,
      `Connection summary: ${dbConnectionPlaceholder.trim() || '(not set)'}`,
      `Tables / schema notes: ${dbTablesNotes.trim() || '(not specified)'}`,
    ].join('\n');

    return [apiBlock, '', dsBlock].join('\n');
  }, [
    selectedApiKey,
    selectedDatasourceKey,
    apiEndpoint,
    apiMethod,
    apiAuthSummary,
    apiParamsNotes,
    dbType,
    dbConnectionPlaceholder,
    dbTablesNotes,
  ]);

  const buildTranscript = useCallback((msgs: ChatMsg[]) => {
    if (!msgs.length) return '(no prior messages)';
    return msgs
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
      .join('\n\n');
  }, []);

  const attachmentsPayload = useMemo(
    () => composeAttachments.map((a) => ({ mimeType: a.mimeType, dataBase64: a.dataBase64 })),
    [composeAttachments]
  );

  const callLlm = useCallback(
    async (
      userMessage: string,
      opts: { expectJson: boolean; systemPrompt: string; maxTokens?: number },
      attachments?: Array<{ mimeType: string; dataBase64: string }>
    ) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const body: Record<string, unknown> = {
        provider: resolvedChatLlm.provider,
        model: resolvedChatLlm.model,
        userMessage,
        dataSourceName: workspaceDataSourceLabel,
        basePrompt: workspacePrompt.trim() || undefined,
        expectJson: opts.expectJson,
        maxTokens: opts.maxTokens ?? (opts.expectJson ? 6144 : 2048),
        systemPrompt: opts.systemPrompt,
        llmProviderLabel: resolvedChatLlm.providerLabel,
        llmModelLabel: resolvedChatLlm.modelLabel,
      };
      if (attachments && attachments.length > 0) {
        body.attachments = attachments;
      }
      try {
        const res = await studioFetch(apiUrl('/api/llm/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(payload?.message || 'Unable to generate response.'));
        }
        return String(payload?.reply || '').trim() || 'No response generated.';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    [
      resolvedChatLlm.provider,
      resolvedChatLlm.model,
      resolvedChatLlm.providerLabel,
      resolvedChatLlm.modelLabel,
      workspaceDataSourceLabel,
      workspacePrompt,
    ]
  );

  const handlePickImages = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
    const maxBytes = 4 * 1024 * 1024;

    const readOne = (file: File): Promise<ComposeAttachment | null> =>
      new Promise((resolve) => {
        const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
        if (!allowed.has(file.type) && !allowed.has(mime)) {
          resolve(null);
          return;
        }
        if (file.size > maxBytes) {
          resolve(null);
          return;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const comma = dataUrl.indexOf(',');
          const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
          if (!b64) resolve(null);
          else resolve({ id, previewUrl: dataUrl, mimeType: mime, dataBase64: b64, name: file.name });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

    void (async () => {
      const additions: ComposeAttachment[] = [];
      for (const file of Array.from(files)) {
        if (additions.length >= 6) break;
        const item = await readOne(file);
        if (item) additions.push(item);
      }
      if (additions.length === 0) return;
      setComposeAttachments((prev) => [...prev, ...additions].slice(0, 6));
    })();
  }, []);

  const handleComposePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind !== 'file') continue;
        const f = it.getAsFile();
        if (f && /^image\//i.test(f.type)) files.push(f);
      }
      if (files.length === 0) return;
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      handlePickImages(dt.files);
    },
    [handlePickImages]
  );

  const handleSendChat = async () => {
    const text = chatInput.trim();
    const attSnap = attachmentsPayload;
    if ((!text && attSnap.length === 0) || busyKind !== 'idle') return;

    const userBubble =
      text ||
      (attSnap.length > 0
        ? `[${attSnap.length} dashboard reference image${attSnap.length > 1 ? 's' : ''} — analyze mockup and propose layout]`
        : '');
    const latestInstruction =
      text ||
      `No separate typed caption. The images attached with this message are dashboard/mockup references: infer layout, components (charts, KPIs, tables, filters), spacing, and hierarchy; relate everything to the workspace datasource and connection specification above. Ask concise clarifying questions only if blocking gaps remain.`;

    const snapshotProposal = proposalPretty.trim();

    setError(null);
    const nextMessages: ChatMsg[] = [...chatMessages, { role: 'user', text: userBubble }];
    setChatMessages(nextMessages);
    setChatInput('');
    setBusyKind('chat');
    const bundledUserMessage = [
      '--- Workspace datasource label ---',
      workspaceDataSourceLabel || '(none)',
      '--- Linked workspace prompt ---',
      workspacePrompt.trim() || '(none)',
      '--- Connection specification ---',
      dataSpecSummary,
      ...(templateBlockForLlm ? [templateBlockForLlm] : []),
      ...(sampleRowsForLlm(liveApiRows)
        ? [
            '--- Sample rows from executed linked API (use real field names and types for bindings) ---',
            sampleRowsForLlm(liveApiRows)!,
          ]
        : []),
      ...(snapshotProposal
        ? [
            '--- Current dashboard proposal JSON ---',
            snapshotProposal,
            'When the latest user message requests changes to this dashboard, respond with ONE complete updated JSON object only (same schema as this proposal — full document, no markdown fences).',
          ]
        : []),
      '--- Conversation so far ---',
      buildTranscript(nextMessages.slice(0, -1)),
      '--- Latest user message ---',
      latestInstruction,
    ].join('\n');
    const att = attSnap.length > 0 ? attSnap : undefined;
    try {
      const reply = await callLlm(
        bundledUserMessage,
        {
          expectJson: false,
          systemPrompt: CHAT_SYSTEM_PROMPT,
          maxTokens: 4096,
        },
        att
      );
      setComposeAttachments([]);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      let parsed = tryParseDashboardProposal(reply);
      if (parsed) {
        setProposalPretty(parsed.pretty);
      } else {
        const editIntent =
          !!snapshotProposal &&
          text.trim().length > 0 &&
          /\b(edit|change|update|add|remove|delete|replace|swap|rename|layout|chart|kpi|filter|title|metric|visualization|dashboard|more|fewer|different|instead)\b/i.test(
            text
          );
        if (editIntent) {
          const repairBundle = [
            'Apply the user instruction to the dashboard proposal.',
            'Output ONLY valid JSON with the same top-level keys as the proposal (dashboard_title, objective, data_source, key_metrics_visualizations, layout_suggestion, global_filters, potential_ai_enhancements).',
            '--- User instruction ---',
            latestInstruction,
            '--- Current proposal JSON ---',
            snapshotProposal,
          ].join('\n');
          const repairReply = await callLlm(
            repairBundle,
            { expectJson: true, systemPrompt: JSON_SYSTEM_PROMPT, maxTokens: 8192 },
            undefined
          );
          const repaired = tryParseDashboardProposal(repairReply);
          if (repaired) {
            setProposalPretty(repaired.pretty);
            setChatMessages((prev) => [
              ...prev,
              { role: 'assistant', text: 'Applied your edits to the dashboard specification.' },
            ]);
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Request failed.';
      setError(msg);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${msg}` }]);
    } finally {
      setBusyKind('idle');
    }
  };

  const handleGenerateJson = async () => {
    if (busyKind !== 'idle') return;
    setError(null);
    setBusyKind('json');
    const bundledUserMessage = [
      'Produce the final dashboard design as JSON only.',
      '--- Workspace datasource label ---',
      workspaceDataSourceLabel || '(none)',
      '--- Linked workspace prompt ---',
      workspacePrompt.trim() || '(none)',
      '--- Connection specification ---',
      dataSpecSummary,
      ...(templateBlockForLlm ? [templateBlockForLlm] : []),
      ...(sampleRowsForLlm(liveApiRows)
        ? [
            '--- Sample rows from executed linked API (use real field names and types for bindings) ---',
            sampleRowsForLlm(liveApiRows)!,
          ]
        : []),
      '--- Conversation so far ---',
      buildTranscript(chatMessages),
    ].join('\n');
    const att = attachmentsPayload.length > 0 ? attachmentsPayload : undefined;
    try {
      const reply = await callLlm(
        bundledUserMessage,
        {
          expectJson: true,
          systemPrompt: JSON_SYSTEM_PROMPT,
          maxTokens: 8192,
        },
        att
      );
      const parsed = tryParseDashboardProposal(reply);
      if (parsed) {
        setProposalPretty(parsed.pretty);
        setRightTab('preview');
        const title = String(parsed.json.dashboard_title ?? parsed.json.dashboardTitle ?? 'Dashboard');
        setComposeAttachments([]);
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Dashboard specification ready for "${title}". Review the App Preview — iterate here or open the Spec tab for JSON.`,
          },
        ]);
      } else {
        setError('Model returned JSON that could not be parsed as a dashboard proposal.');
        setChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Request failed.';
      setError(msg);
    } finally {
      setBusyKind('idle');
    }
  };

  handleGenerateJsonRef.current = handleGenerateJson;

  useEffect(() => {
    if (!autoStartBuild) return;
    if (initialProposalJson?.trim()) return;
    let cancelled = false;
    const brief = workspacePrompt.trim();
    const seed: ChatMsg[] = [
      ...(brief ? [{ role: 'user' as const, text: brief }] : []),
      {
        role: 'assistant',
        text: "I've started from your dashboard brief. Reviewing datasource, API context, and mockups — generating the structured dashboard proposal.",
        bubbleKind: 'agent_status' as const,
      },
    ];
    setChatMessages(seed);
    const t = window.setTimeout(() => {
      if (!cancelled) void handleGenerateJsonRef.current();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [autoStartBuild, initialProposalJson]); // eslint-disable-line react-hooks/exhaustive-deps -- workspacePrompt captured when landing opens studio

  const handleStopAgent = () => {
    abortRef.current?.abort();
    setBusyKind('idle');
  };

  const handleCopyProposal = async () => {
    if (!proposalPretty) return;
    try {
      await navigator.clipboard.writeText(proposalPretty);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  const handleSaveDashboard = useCallback(async () => {
    if (!proposalPretty.trim()) {
      setError('Nothing to save yet — generate a proposal first.');
      return;
    }
    const merged = mergeDashboardMetaIntoProposalJson(proposalPretty, {
      title: dashboardSaveName.trim() || 'Untitled dashboard',
      objective: dashboardObjectiveDraft,
    });
    if (!merged.ok) {
      setError('Could not update dashboard JSON. Fix syntax in the Spec tab.');
      return;
    }
    setProposalPretty(merged.pretty);
    setError(null);
    const displayName = dashboardSaveName.trim() || 'Untitled dashboard';

    const headers = getStudioAuthHeaders();
    if (headers['x-user-email']) {
      try {
        const res = await studioFetch(apiUrl('/api/dashboards'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            ...(remoteSavedDashboardId ? { id: remoteSavedDashboardId } : {}),
            name: displayName,
            visibility: 'private',
            updatedAt: Date.now(),
            payload: {
              kind: DESIGN_STUDIO_REMOTE_PAYLOAD_KIND,
              proposalJson: merged.pretty,
              publishedSlug: publishedSlug ?? undefined,
              workspacePrompt,
              workspaceDataSourceLabel,
              llmProvider: resolvedChatLlm.provider,
              llmModel: resolvedChatLlm.model,
              selectedApiKey:
                selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:') ? selectedApiKey : undefined,
              selectedDatasourceKey: selectedDatasourceKey.trim() || undefined,
            },
          }),
        });
        const data = await readApiJson<{ ok?: boolean; id?: string; message?: string }>(res);
        if (!res.ok || !data?.ok || !data.id) {
          throw new Error(data?.message || 'Unable to save dashboard to workspace.');
        }
        setRemoteSavedDashboardId(String(data.id));
        setSaveToast(`Saved “${displayName}” to your workspace`);
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save dashboard to workspace.');
      }
    }

    const res = saveDesignStudioDashboard({
      name: displayName,
      proposalJson: merged.pretty,
      selectedApiKey:
        selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:') ? selectedApiKey : undefined,
      selectedDatasourceKey: selectedDatasourceKey.trim() || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaveToast(`Saved “${displayName}” to this browser`);
  }, [
    proposalPretty,
    dashboardSaveName,
    dashboardObjectiveDraft,
    selectedApiKey,
    selectedDatasourceKey,
    remoteSavedDashboardId,
    publishedSlug,
    workspacePrompt,
    workspaceDataSourceLabel,
    resolvedChatLlm.provider,
    resolvedChatLlm.model,
  ]);

  const togglePreviewMetaEdit = useCallback(() => {
    if (!proposalPretty.trim()) return;
    if (previewMetaEditOpen) {
      const merged = mergeDashboardMetaIntoProposalJson(proposalPretty, {
        title: dashboardSaveName.trim() || 'Untitled dashboard',
        objective: dashboardObjectiveDraft,
      });
      if (merged.ok) {
        setProposalPretty(merged.pretty);
        setError(null);
      } else {
        setError('Could not apply edits — fix JSON in the Spec tab.');
      }
      setPreviewMetaEditOpen(false);
      return;
    }
    setPreviewMetaEditOpen(true);
  }, [proposalPretty, previewMetaEditOpen, dashboardSaveName, dashboardObjectiveDraft]);

  const handleLoadTemplateSkeleton = () => {
    const tpl = selectedTemplate;
    if (!tpl?.starterProposal) return;
    setProposalPretty(JSON.stringify(tpl.starterProposal, null, 2));
    setPublishedSlug(null);
    setRightTab('preview');
  };

  const panelBorder = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const composeShell = isDarkMode
    ? 'rounded-2xl border border-zinc-700/80 bg-zinc-900/95 shadow-inner'
    : 'rounded-2xl border border-slate-200 bg-white shadow-sm';

  const pillPopoverTriggerCls =
    `inline-flex min-h-[36px] w-[min(100%,220px)] min-w-[132px] shrink-0 cursor-pointer items-center justify-between gap-2 truncate rounded-full border py-2 pl-3 pr-3 text-left text-[11px] font-medium outline-none transition-colors ` +
    (isDarkMode
      ? 'border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-800/90'
      : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-white');

  const designStudioDatasourceSections = useMemo((): StudioPopoverSelectSection[] => {
    return [
      {
        options: [
          { value: '', label: 'Datasource…' },
          ...appDataDatasourceList.map((item) => ({
            value: item.id,
            label: formatAppDataDatasourceLabel(item),
          })),
        ],
      },
    ];
  }, [appDataDatasourceList]);

  const designStudioApiSections = useMemo((): StudioPopoverSelectSection[] => {
    const clearRow: StudioPopoverSelectSection = { options: [{ value: '', label: 'API…' }] };
    if (savedApisList.length === 0 && externalApisList.length === 0) return [clearRow];
    const sections: StudioPopoverSelectSection[] = [clearRow];
    if (savedApisList.length > 0) {
      sections.push({
        heading: 'Blueprint APIs',
        options: savedApisList.map((api) => ({ value: `bp:${api.id}`, label: api.name })),
      });
    }
    if (externalApisList.length > 0) {
      sections.push({
        heading: 'External APIs',
        options: externalApisList.map((ex) => ({ value: `ext:${ex.id}`, label: ex.name })),
      });
    }
    return sections;
  }, [savedApisList, externalApisList]);

  const designStudioLlmSections = useMemo((): StudioPopoverSelectSection[] => {
    const opts: { value: string; label: string }[] = [
      { value: WORKSPACE_LLM_VALUE, label: `${llmProviderLabel} · ${llmModelLabel}` },
    ];
    for (const row of llmConfigsWithKey) {
      const p = String(row.provider || '').toLowerCase();
      const m = String(row.model_name || '').trim();
      if (!p || !m) continue;
      opts.push({ value: llmChoiceFromSaved(p, m), label: formatLlmRowLabel(p, m) });
    }
    return [{ options: opts }];
  }, [llmConfigsWithKey, llmProviderLabel, llmModelLabel]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <header
        className={`flex shrink-0 flex-nowrap items-center justify-between gap-3 overflow-x-auto border-b px-4 py-3 ${
          isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium ${
              isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="hidden h-8 w-px sm:block bg-slate-600/30" aria-hidden />
          <div className="flex min-w-0 items-center gap-2">
            <LayoutGrid className={`h-5 w-5 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
            <div className="min-w-0">
              <h1 className={`truncate text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                Dashboard Design Studio
              </h1>
              <p className={`truncate text-xs ${muted}`}>{activeHeaderLlmLine}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <button
            type="button"
            disabled={!proposalPretty.trim()}
            onClick={() => void handleSaveDashboard()}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              isDarkMode
                ? 'border-slate-600 text-slate-100 hover:bg-slate-800 disabled:opacity-40'
                : 'border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-40'
            }`}
          >
            <Save className="h-4 w-4" />
            Save dashboard
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={`flex min-h-[42vh] min-w-0 flex-1 flex-col border-b lg:min-h-0 lg:w-1/2 lg:max-w-[50%] lg:flex-none lg:border-b-0 lg:border-r ${
            isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
          }`}
        >
          <details
            className={`group shrink-0 border-b px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}
          >
            <summary
              className={`cursor-pointer list-none py-1 text-xs font-semibold outline-none [&::-webkit-details-marker]:hidden ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
            >
              <span className="inline-flex items-center gap-2">
                <LayoutTemplate className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
                Layout templates
                <ChevronDown className={`ml-auto h-3.5 w-3.5 opacity-60 transition-transform group-open:rotate-180 ${muted}`} />
              </span>
            </summary>
            <p className={`mt-2 text-[10px] leading-snug ${muted}`}>
              Optional Nexus-style shells. Blueprint context is sent with every message; load skeleton for a quick Proposal preview.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTemplateId(null)}
                className={`relative max-w-[180px] rounded-xl border px-3 py-2 text-left text-[11px] transition-colors ${
                  selectedTemplateId === null
                    ? isDarkMode
                      ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/35'
                      : 'border-violet-500 bg-violet-50 ring-1 ring-violet-300/60'
                    : isDarkMode
                      ? 'border-slate-700 bg-slate-950 hover:border-slate-600'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                {selectedTemplateId === null ? (
                  <Check className={`absolute right-2 top-2 h-3.5 w-3.5 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`} />
                ) : null}
                <span className={`font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Custom</span>
                <span className={`mt-0.5 block leading-snug ${muted}`}>No fixed template — describe freely</span>
              </button>
              {DASHBOARD_DESIGN_TEMPLATES.map((tpl) => {
                const selected = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`relative max-w-[200px] rounded-xl border px-3 py-2 text-left text-[11px] transition-colors ${
                      selected
                        ? isDarkMode
                          ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/35'
                          : 'border-violet-500 bg-violet-50 ring-1 ring-violet-300/60'
                        : isDarkMode
                          ? 'border-slate-700 bg-slate-950 hover:border-slate-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {selected ? (
                      <Check className={`absolute right-2 top-2 h-3.5 w-3.5 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`} />
                    ) : null}
                    <div className={`mb-2 h-9 rounded-lg bg-gradient-to-br ${tpl.accentClass} shadow-inner`} aria-hidden />
                    <span className={`font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{tpl.name}</span>
                    <span className={`mt-0.5 block leading-snug ${muted}`}>{tpl.tagline}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={!selectedTemplate?.starterProposal}
                onClick={() => handleLoadTemplateSkeleton()}
                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isDarkMode
                    ? 'border-slate-600 text-slate-100 hover:bg-slate-800 disabled:hover:bg-transparent'
                    : 'border-slate-300 text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent'
                }`}
              >
                Load skeleton → Preview
              </button>
            </div>
          </details>

          <div className={`shrink-0 border-b px-4 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Designer agent</h2>
            <p className={`text-xs leading-snug ${muted}`}>
              Describe metrics and layout, attach mockups, or refine after auto-build. Vision models receive pixels when you attach images.
            </p>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
            {chatMessages.length === 0 ? (
              <p className={`text-sm ${muted}`}>
                Optional: pick a layout template above. Send a message or wait while the agent generates your dashboard specification.
              </p>
            ) : (
              <ul className="space-y-3">
                {chatMessages.map((m, i) => {
                  if (m.role === 'user') {
                    return (
                      <li
                        key={i}
                        className={`max-w-[min(100%,720px)] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          isDarkMode ? 'ml-auto bg-violet-900/40 text-slate-100' : 'ml-auto bg-violet-100 text-slate-900'
                        }`}
                      >
                        <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide ${muted}`}>You</span>
                        <pre className="font-sans whitespace-pre-wrap break-words">{m.text}</pre>
                      </li>
                    );
                  }
                  if (m.bubbleKind === 'agent_question') {
                    return (
                      <li key={i} className="max-w-[min(100%,720px)]">
                        <div
                          className={`rounded-xl border p-3 text-sm leading-relaxed ${
                            isDarkMode ? 'border-violet-500/35 bg-violet-950/25 text-slate-100' : 'border-violet-200 bg-violet-50/90 text-slate-900'
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                              Agent asked a question
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                m.answered
                                  ? isDarkMode
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-emerald-100 text-emerald-800'
                                  : isDarkMode
                                    ? 'bg-amber-500/15 text-amber-200'
                                    : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {m.answered ? 'Answered' : 'Open'}
                            </span>
                          </div>
                          <pre className="font-sans whitespace-pre-wrap break-words">{m.text}</pre>
                        </div>
                      </li>
                    );
                  }
                  if (m.bubbleKind === 'agent_status') {
                    return (
                      <li key={i} className="max-w-[min(100%,720px)]">
                        <div
                          className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${
                            isDarkMode ? 'border-sky-500/30 bg-sky-950/40 text-slate-100' : 'border-sky-200 bg-sky-50 text-slate-900'
                          }`}
                        >
                          <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Designer</span>
                          <pre className="font-sans whitespace-pre-wrap break-words">{m.text}</pre>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={i}
                      className={`max-w-[min(100%,720px)] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        isDarkMode ? 'mr-auto border border-slate-800 bg-slate-900 text-slate-200' : 'mr-auto border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Designer</span>
                      <pre className="font-sans whitespace-pre-wrap break-words">{m.text}</pre>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className={`shrink-0 px-4 py-2 text-xs ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>{error}</div>
          )}

          <div className={`shrink-0 space-y-2 p-3 ${isDarkMode ? 'border-t border-slate-800 bg-slate-950' : 'border-t border-slate-200 bg-white'}`}>
            {busyKind !== 'idle' ? (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                  isDarkMode ? 'bg-emerald-500/12 text-emerald-200' : 'bg-emerald-500/15 text-emerald-800'
                }`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Agent is running…
              </div>
            ) : null}

            <div className={`${composeShell} p-3`}>
              {composeAttachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {composeAttachments.map((a) => (
                    <div key={a.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10">
                      <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => setComposeAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        className="absolute right-0 top-0 rounded-bl-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                rows={3}
                placeholder="Message Agent"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onPaste={handleComposePaste}
                className={`min-h-[72px] w-full resize-none border-0 bg-transparent text-sm outline-none ${
                  isDarkMode ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-slate-800 placeholder:text-slate-400'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!chatInput.trim() && composeAttachments.length === 0) return;
                    void handleSendChat();
                  }
                }}
              />

              <div className="mt-3 flex flex-nowrap items-center gap-3 overflow-x-auto border-t border-white/5 pt-3 pb-0.5">
                <input
                  ref={composeImageInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handlePickImages(e.target.files);
                    e.target.value = '';
                  }}
                />

                <div className="flex shrink-0 flex-nowrap items-center justify-start gap-2 overflow-x-auto">
                  <button
                    type="button"
                    aria-label="Attach images"
                    onClick={() => composeImageInputRef.current?.click()}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isDarkMode ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <div
                    className={`mx-0.5 hidden h-7 w-px shrink-0 sm:block ${isDarkMode ? 'bg-zinc-700' : 'bg-slate-200'}`}
                    aria-hidden
                  />
                  <div className="w-[min(210px,42vw)] min-w-[124px] shrink-0">
                    <StudioPopoverSelect
                      ariaLabel="Datasource"
                      disabled={appDataDsBusy}
                      isDarkMode={isDarkMode}
                      value={selectedDatasourceKey}
                      placeholder="Datasource…"
                      sections={designStudioDatasourceSections}
                      onMenuOpen={() => void refreshAppDataDatasources()}
                      onChange={(v) => {
                        if (!v) {
                          clearDatasourceSelection();
                          return;
                        }
                        const item = appDataDatasourceList.find((x) => x.id === v);
                        if (item) applyAppDataDatasource(item);
                      }}
                      triggerClassName={pillPopoverTriggerCls}
                    />
                  </div>
                  <div className="w-[min(210px,42vw)] min-w-[124px] shrink-0">
                    <StudioPopoverSelect
                      ariaLabel="Saved API"
                      isDarkMode={isDarkMode}
                      value={selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:') ? selectedApiKey : ''}
                      placeholder="API…"
                      sections={designStudioApiSections}
                      onMenuOpen={() => void refreshApis()}
                      onChange={(v) => {
                        if (!v) {
                          clearApiSelection();
                          return;
                        }
                        if (v.startsWith('bp:')) {
                          const api = savedApisList.find((x) => `bp:${x.id}` === v);
                          if (api) applyBlueprintApi(api);
                          return;
                        }
                        if (v.startsWith('ext:')) {
                          const id = v.slice(4);
                          const ex = externalApisList.find((x) => x.id === id);
                          if (ex) applyExternalApi(ex);
                        }
                      }}
                      triggerClassName={pillPopoverTriggerCls}
                    />
                  </div>
                  <div className="w-[min(240px,46vw)] min-w-[140px] shrink-0">
                    <StudioPopoverSelect
                      ariaLabel="LLM"
                      disabled={llmCatalogLoading}
                      isDarkMode={isDarkMode}
                      value={llmSelectValue}
                      placeholder="LLM…"
                      sections={designStudioLlmSections}
                      onChange={(v) => setLlmSelectValue(v)}
                      triggerClassName={pillPopoverTriggerCls}
                    />
                  </div>
                  {(llmCatalogLoading ||
                    (!llmCatalogLoading && llmConfigsWithKey.length === 0)) && (
                    <>
                      <span
                        className={`hidden h-4 w-px shrink-0 sm:block ${isDarkMode ? 'bg-zinc-700' : 'bg-slate-300'}`}
                        aria-hidden
                      />
                      <div className={`flex shrink-0 items-center gap-x-3 text-[10px] ${muted}`}>
                        {llmCatalogLoading ? (
                          <span className="whitespace-nowrap">Loading LLM keys…</span>
                        ) : llmConfigsWithKey.length === 0 ? (
                          <span className="max-w-[220px] truncate sm:max-w-xs md:max-w-md">
                            Saved LLM keys optional — workspace default uses server/env keys.
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

                <div className="min-w-[12px] flex-1 shrink" aria-hidden />

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className={`inline-flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full opacity-35 ${
                      isDarkMode ? 'text-zinc-400' : 'text-slate-500'
                    }`}
                  >
                    <Github className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    disabled={!proposalPretty}
                    aria-label="Copy proposal JSON"
                    title="Copy JSON"
                    onClick={() => void handleCopyProposal()}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      isDarkMode ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Save className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className={`inline-flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full opacity-35 ${
                      isDarkMode ? 'text-zinc-400' : 'text-slate-500'
                    }`}
                  >
                    <GitBranch className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled
                    title="Voice input coming soon"
                    className={`inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full opacity-35 ${
                      isDarkMode ? 'text-zinc-400' : 'text-slate-500'
                    }`}
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                  {busyKind !== 'idle' ? (
                    <button
                      type="button"
                      aria-label="Stop agent"
                      onClick={handleStopAgent}
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isDarkMode
                          ? 'border-rose-500/40 bg-rose-950/50 text-rose-200 hover:bg-rose-950'
                          : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      <Square className="h-5 w-5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!chatInput.trim() && composeAttachments.length === 0}
                      aria-label="Send message"
                      onClick={() => void handleSendChat()}
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-35 ${
                        isDarkMode ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : 'bg-slate-900 hover:bg-slate-800'
                      }`}
                    >
                      <ArrowUp className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:w-1/2 lg:max-w-[50%] lg:flex-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
          <div
            className={`flex shrink-0 flex-col gap-2 border-b px-4 py-3 ${
              isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
              <h2 className={`shrink-0 text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                App Preview
              </h2>
              {saveToast ? (
                <span className={`shrink-0 text-[11px] font-medium ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  {saveToast}
                </span>
              ) : null}
              <input
                type="text"
                aria-label="Dashboard name"
                value={dashboardSaveName}
                onChange={(e) => setDashboardSaveName(e.target.value)}
                placeholder="Dashboard name"
                disabled={!proposalPretty.trim()}
                className={`min-w-[120px] flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 disabled:opacity-40'
                    : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 disabled:opacity-40'
                }`}
              />
              <button
                type="button"
                disabled={!proposalPretty.trim()}
                onClick={() => void togglePreviewMetaEdit()}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  previewMetaEditOpen
                    ? isDarkMode
                      ? 'border-violet-500 bg-violet-950/50 text-violet-200'
                      : 'border-violet-400 bg-violet-50 text-violet-900'
                    : isDarkMode
                      ? 'border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40'
                      : 'border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-40'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                {previewMetaEditOpen ? 'Apply & close' : 'Edit details'}
              </button>
              <button
                type="button"
                disabled={!proposalPretty.trim()}
                onClick={() => void handleSaveDashboard()}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 ${
                  isDarkMode ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
            {previewMetaEditOpen && proposalPretty.trim() ? (
              <label className={`flex flex-col gap-1 ${muted}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-current">Objective</span>
                <textarea
                  rows={3}
                  value={dashboardObjectiveDraft}
                  onChange={(e) => setDashboardObjectiveDraft(e.target.value)}
                  className={`w-full resize-y rounded-lg border px-2.5 py-2 text-xs outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                      : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                  }`}
                  placeholder="Dashboard goal — saved into proposal JSON"
                />
              </label>
            ) : null}
          </div>

          <div
            className={`flex shrink-0 flex-nowrap gap-1 overflow-x-auto border-b px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}
          >
            <button
              type="button"
              onClick={() => setRightTab('preview')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                rightTab === 'preview'
                  ? 'bg-violet-600 text-white'
                  : isDarkMode
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setRightTab('spec')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                rightTab === 'spec'
                  ? 'bg-violet-600 text-white'
                  : isDarkMode
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Spec (JSON)
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rightTab === 'preview' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4">
                <p className={`text-center text-xs leading-relaxed ${muted}`}>
                  Make your app publicly available with managed infrastructure — publish from the Spec tab when your JSON is ready.
                </p>

                {!parsedProposal ? (
                  <div
                    className={`relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border ${panelBorder} aspect-video min-h-[240px] max-h-[min(56vh,420px)]`}
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br opacity-90 ${
                        isDarkMode ? 'from-slate-900 via-slate-800 to-violet-950/90' : 'from-slate-200 via-white to-violet-100'
                      }`}
                    />
                    <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)] bg-[length:200%_100%]" />
                    <div className="absolute inset-5 flex flex-col gap-3 opacity-50">
                      <div className={`h-7 w-2/5 rounded-lg ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className={`h-14 rounded-lg ${isDarkMode ? 'bg-slate-700/80' : 'bg-slate-300/90'}`}
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        ))}
                      </div>
                      <div className={`min-h-[100px] flex-1 rounded-xl ${isDarkMode ? 'bg-slate-800/90' : 'bg-slate-200/90'}`} />
                    </div>
                    <div
                      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center ${
                        isDarkMode ? 'bg-slate-950/35 backdrop-blur-[2px]' : 'bg-white/40 backdrop-blur-[2px]'
                      }`}
                    >
                      <Loader2
                        className={`h-11 w-11 animate-spin ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`}
                        aria-hidden
                      />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {busyKind === 'json'
                          ? 'Generating your dashboard…'
                          : busyKind === 'chat'
                            ? 'Designer is working…'
                            : 'Design preview loading…'}
                      </p>
                      <p className={`max-w-sm text-xs leading-relaxed ${muted}`}>
                        Your dashboard appears here when the agent finishes. Use chat to describe what you want, or wait if build already started.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border ${panelBorder} aspect-video max-h-56 bg-gradient-to-br ${
                        isDarkMode ? 'from-slate-900 via-slate-800 to-violet-950/80' : 'from-slate-100 via-white to-violet-50'
                      }`}
                    >
                      {previewSlides.length > 0 ? (
                        <>
                          <img
                            src={previewSlides[carouselIdx]}
                            alt=""
                            className="h-full w-full object-cover object-top"
                          />
                          {previewSlides.length > 1 ? (
                            <>
                              <button
                                type="button"
                                aria-label="Previous slide"
                                onClick={() =>
                                  setCarouselIdx((i) => (i - 1 + previewSlides.length) % previewSlides.length)
                                }
                                className={`absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm ${
                                  isDarkMode ? 'border-white/10 bg-black/40 text-white hover:bg-black/55' : 'border-slate-200 bg-white/90 text-slate-800 hover:bg-white'
                                }`}
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Next slide"
                                onClick={() => setCarouselIdx((i) => (i + 1) % previewSlides.length)}
                                className={`absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm ${
                                  isDarkMode ? 'border-white/10 bg-black/40 text-white hover:bg-black/55' : 'border-slate-200 bg-white/90 text-slate-800 hover:bg-white'
                                }`}
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                                {previewSlides.map((_, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    aria-label={`Slide ${idx + 1}`}
                                    onClick={() => setCarouselIdx(idx)}
                                    className={`h-1.5 rounded-full transition-all ${
                                      idx === carouselIdx
                                        ? 'w-6 bg-white'
                                        : `w-1.5 ${isDarkMode ? 'bg-white/35 hover:bg-white/55' : 'bg-slate-400/50 hover:bg-slate-500/70'}`
                                    }`}
                                  />
                                ))}
                              </div>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <div className={`flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs ${muted}`}>
                          <LayoutGrid className={`h-10 w-10 opacity-40 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`} />
                          <span>Optional: attach reference mockups in chat for this carousel.</span>
                        </div>
                      )}
                    </div>

                    {(selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:')) && (
                      <div className={`rounded-xl border px-3 py-2 text-[11px] ${panelBorder}`}>
                        {liveApiLoading ? (
                          <span className={muted}>Executing linked API — sample rows load into chart preview…</span>
                        ) : liveApiError ? (
                          <span className={isDarkMode ? 'text-amber-300' : 'text-amber-700'}>{liveApiError}</span>
                        ) : liveApiRows.length > 0 ? (
                          <span className={isDarkMode ? 'text-emerald-300/95' : 'text-emerald-700'}>
                            Loaded {liveApiRows.length} row{liveApiRows.length === 1 ? '' : 's'} from {liveApiSourceLabel}.
                            Charts bind to columns matched from your proposal hints.
                          </span>
                        ) : (
                          <span className={muted}>API responded but no tabular rows were found (expect JSON array or &#123; data: [...] &#125;).</span>
                        )}
                      </div>
                    )}

                    <div className={`rounded-xl border ${panelBorder}`}>
                      <DashboardProposalVisualPreview
                        proposal={parsedProposal}
                        isDarkMode={isDarkMode}
                        compact
                        liveDataset={previewLiveDataset}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <p className={`text-xs ${muted}`}>Visual mock, JSON, and shareable links after you publish.</p>
                  <button
                    type="button"
                    disabled={!proposalPretty}
                    onClick={() => void handleCopyProposal()}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium ${
                      isDarkMode ? 'text-slate-200 hover:bg-slate-800 disabled:opacity-40' : 'text-slate-700 hover:bg-slate-100 disabled:opacity-40'
                    }`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy JSON
                  </button>
                </div>

                {parsedProposal ? (
                  <div className={`shrink-0 rounded-xl border ${panelBorder}`}>
                    <DashboardProposalVisualPreview
                      proposal={parsedProposal}
                      isDarkMode={isDarkMode}
                      compact
                      liveDataset={previewLiveDataset}
                    />
                  </div>
                ) : (
                  <div
                    className={`shrink-0 rounded-xl border border-dashed px-4 py-10 text-center text-sm ${
                      isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-500'
                    }`}
                  >
                    Run <strong className="font-semibold">Publish preview</strong> below once JSON is ready, or refine via chat so the agent outputs valid proposal JSON.
                  </div>
                )}

                <div className={`shrink-0 rounded-xl border ${panelBorder} p-3`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!parsedProposal || publishBusy}
                      onClick={() => void handlePublishPreview()}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'
                      }`}
                    >
                      {publishBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                      Publish preview
                    </button>
                    {publishedSlug ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopyShareUrl()}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                            isDarkMode
                              ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                              : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Copy public URL
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyEmbed()}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                            isDarkMode
                              ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                              : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy embed HTML
                        </button>
                      </>
                    ) : null}
                  </div>
                  {!hasWorkspaceAuth() ? (
                    <p className={`mt-2 text-[11px] leading-snug ${muted}`}>
                      Sign in with your workspace profile to publish a public URL and iframe snippet.
                    </p>
                  ) : (
                    <p className={`mt-2 text-[11px] leading-snug ${muted}`}>
                      Each publish creates a new slug. Open the public URL in a browser or paste the embed code into Notion, docs, or an internal portal.
                    </p>
                  )}
                  {publishedSlug ? (
                    <p className={`mt-2 break-all font-mono text-[10px] leading-relaxed ${muted}`}>
                      {typeof window !== 'undefined' ? window.location.origin : ''}/public-design-studio/{publishedSlug}
                    </p>
                  ) : null}
                </div>

                <div className={`min-h-[min(52vh,480px)] shrink-0 rounded-xl border ${panelBorder}`}>
                  <PostmanStyleJsonViewer
                    text={proposalPretty}
                    isDarkMode={isDarkMode}
                    fillHeight
                    frameless
                    className="h-full min-h-[min(52vh,480px)]"
                    emptyHint="Paste or edit proposal JSON here, or use chat so the agent outputs JSON."
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className={`flex max-h-[min(45vh,360px)] shrink-0 flex-col gap-3 overflow-y-auto border-t px-4 py-3 ${
              isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex shrink-0 justify-center">
              <span
                className={`inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium ${
                  isDarkMode ? 'border-slate-700 bg-slate-900/80 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {busyKind !== 'idle' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" /> : null}
                <span className="truncate">{busyKind === 'json' ? 'Scanning file contents' : previewStatusLabel}</span>
              </span>
            </div>

            <div className={`flex shrink-0 flex-col gap-3 border-t pt-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Preview URL</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyShareUrl()}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                      isDarkMode ? 'text-violet-300 hover:bg-slate-800' : 'text-violet-700 hover:bg-violet-50'
                    }`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <p className={`break-all font-mono text-[11px] leading-snug ${publishedSlug ? (isDarkMode ? 'text-sky-300/95' : 'text-sky-800') : muted}`}>
                  {publishedSlug ? `/public-design-studio/${publishedSlug}` : '/public-design-studio/…'}
                </p>
                <p className={`break-all font-mono text-[10px] leading-relaxed ${muted}`}>
                  {publishedSlug ? shareUrlsForSlug(publishedSlug).publicUrl : 'Publish from Spec (JSON) to create your preview link.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Embed code</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyEmbed()}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                      isDarkMode ? 'text-violet-300 hover:bg-slate-800' : 'text-violet-700 hover:bg-violet-50'
                    }`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre
                  className={`max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border p-2 font-mono text-[10px] leading-relaxed ${
                    isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  {publishedSlug
                    ? shareUrlsForSlug(publishedSlug).embedSnippet
                    : '<!-- Publish dashboard preview from Spec (JSON); iframe snippet appears here. -->'}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
