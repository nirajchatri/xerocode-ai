import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Image as ImageIcon, LayoutGrid, Loader2, Trash2, X } from 'lucide-react';
import { apiUrl, getStudioAuthHeaders, readApiJson, studioFetch } from '../lib/apiBase';
import type { CopilotLlmProviderId } from '../lib/copilotLlmCatalog';
import { COPILOT_LLM_PROVIDERS, COPILOT_MODELS_BY_PROVIDER } from '../lib/copilotLlmCatalog';
import { DESIGN_STUDIO_REMOTE_PAYLOAD_KIND } from '../lib/designStudioSavedDashboards';
import { formatAppDataDatasourceLabel, loadAppDataDatasourceList, type AppDataDatasourceItem } from '../lib/loadAppDataDatasourceList';
import { readSavedApis, type SavedApi } from '../lib/savedApis';
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
import { StudioPopoverSelect, type StudioPopoverSelectSection } from './StudioPopoverSelect';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';

export type LandingComposeAttachment = {
  id: string;
  previewUrl: string;
  mimeType: string;
  dataBase64: string;
  name: string;
};

export type DesignStudioLaunchPayload = {
  workspacePrompt: string;
  workspaceDataSourceLabel: string;
  llmProvider: CopilotLlmProviderId;
  llmModel: string;
  llmProviderLabel: string;
  llmModelLabel: string;
  suggestedApiRef?: string;
  initialSelectedDatasourceKey?: string;
  initialAttachments?: LandingComposeAttachment[];
  /** When true, studio opens and immediately runs structured proposal generation */
  autoStartBuild?: boolean;
  savedRemoteDashboardId?: string;
  initialProposalJson?: string;
  initialPublishedSlug?: string | null;
};

type RemoteSavedDashboardRow = {
  id: string;
  name: string;
  updatedAt: number;
  payload: {
    kind?: string;
    proposalJson?: string;
    publishedSlug?: string;
    workspacePrompt?: string;
    workspaceDataSourceLabel?: string;
    llmProvider?: string;
    llmModel?: string;
    selectedApiKey?: string;
    selectedDatasourceKey?: string;
  };
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

function coerceCopilotProvider(raw: string | undefined, fallback: CopilotLlmProviderId): CopilotLlmProviderId {
  const id = String(raw || '').toLowerCase().trim();
  if (id && COPILOT_LLM_PROVIDERS.some((p) => p.id === id)) return id as CopilotLlmProviderId;
  return fallback;
}

type LlmConfigApiRow = { provider?: string; model_name?: string; api_key?: string };

export type DesignStudioLandingScreenProps = {
  isDarkMode: boolean;
  workspaceLlmProvider: CopilotLlmProviderId;
  workspaceLlmModel: string;
  workspaceLlmProviderLabel: string;
  workspaceLlmModelLabel: string;
  onOpenStudio: (payload: DesignStudioLaunchPayload) => void;
};

export const DesignStudioLandingScreen: React.FC<DesignStudioLandingScreenProps> = ({
  isDarkMode,
  workspaceLlmProvider,
  workspaceLlmModel,
  workspaceLlmProviderLabel,
  workspaceLlmModelLabel,
  onOpenStudio,
}) => {
  const [prompt, setPrompt] = useState('');
  const [savedApisList, setSavedApisList] = useState<SavedApi[]>(() => readSavedApis());
  const [externalApisList, setExternalApisList] = useState<ExternalApiDefinition[]>(() => readExternalApis());
  const [appDataDatasourceList, setAppDataDatasourceList] = useState<AppDataDatasourceItem[]>([]);
  const [appDataDsBusy, setAppDataDsBusy] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState('');
  const [selectedDatasourceKey, setSelectedDatasourceKey] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<LandingComposeAttachment[]>([]);
  const composeImageInputRef = useRef<HTMLInputElement>(null);

  const [remoteSaved, setRemoteSaved] = useState<RemoteSavedDashboardRow[]>([]);
  const [remoteSavedBusy, setRemoteSavedBusy] = useState(false);

  const [llmConfigsWithKey, setLlmConfigsWithKey] = useState<LlmConfigApiRow[]>([]);
  const [llmCatalogLoading, setLlmCatalogLoading] = useState(true);
  const [llmSelectValue, setLlmSelectValue] = useState<string>(WORKSPACE_LLM_VALUE);

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
    void (async () => {
      setLlmCatalogLoading(true);
      try {
        const res = await studioFetch(apiUrl('/api/llm-config'));
        const data = await readApiJson<{ ok?: boolean; configs?: LlmConfigApiRow[] }>(res);
        const rows = res.ok && data?.ok && Array.isArray(data.configs) ? data.configs : [];
        const withKey = rows.filter((r) => String(r.api_key || '').trim());
        if (!cancelled) setLlmConfigsWithKey(withKey);
      } catch {
        if (!cancelled) setLlmConfigsWithKey([]);
      } finally {
        if (!cancelled) setLlmCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = getStudioAuthHeaders();
      if (!headers['x-user-email']) {
        setRemoteSaved([]);
        return;
      }
      setRemoteSavedBusy(true);
      try {
        const res = await studioFetch(apiUrl('/api/dashboards'), { headers });
        const data = await readApiJson<{ ok?: boolean; dashboards?: unknown[] }>(res);
        const rows = res.ok && data?.ok && Array.isArray(data.dashboards) ? data.dashboards : [];
        const mapped: RemoteSavedDashboardRow[] = [];
        for (const r of rows) {
          const rec = r as Record<string, unknown>;
          const payload = (rec.payload || {}) as RemoteSavedDashboardRow['payload'];
          if (payload?.kind !== DESIGN_STUDIO_REMOTE_PAYLOAD_KIND) continue;
          mapped.push({
            id: String(rec.id || ''),
            name: String(rec.name || ''),
            updatedAt: Number(rec.updatedAt ?? rec.updated_at ?? 0),
            payload,
          });
        }
        const sorted = mapped.filter((x) => x.id).sort((a, b) => b.updatedAt - a.updatedAt);
        if (!cancelled) setRemoteSaved(sorted);
      } catch {
        if (!cancelled) setRemoteSaved([]);
      } finally {
        if (!cancelled) setRemoteSavedBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedLlm = useMemo(() => {
    if (llmSelectValue === WORKSPACE_LLM_VALUE) {
      return {
        provider: workspaceLlmProvider,
        model: workspaceLlmModel,
        providerLabel: workspaceLlmProviderLabel,
        modelLabel: workspaceLlmModelLabel,
      };
    }
    const parsed = parseSavedLlmChoice(llmSelectValue);
    if (!parsed) {
      return {
        provider: workspaceLlmProvider,
        model: workspaceLlmModel,
        providerLabel: workspaceLlmProviderLabel,
        modelLabel: workspaceLlmModelLabel,
      };
    }
    const pLab = COPILOT_LLM_PROVIDERS.find((p) => p.id === parsed.provider)?.label ?? parsed.provider;
    const mLab =
      COPILOT_MODELS_BY_PROVIDER[parsed.provider]?.find((m) => m.value === parsed.model)?.label ?? parsed.model;
    return { provider: parsed.provider, model: parsed.model, providerLabel: pLab, modelLabel: mLab };
  }, [
    llmSelectValue,
    workspaceLlmProvider,
    workspaceLlmModel,
    workspaceLlmProviderLabel,
    workspaceLlmModelLabel,
  ]);

  const datasourceLabel = useMemo(() => {
    if (!selectedDatasourceKey.trim()) return 'Workspace · no datasource selected';
    const item = appDataDatasourceList.find((x) => x.id === selectedDatasourceKey);
    return item ? formatAppDataDatasourceLabel(item) : selectedDatasourceKey;
  }, [selectedDatasourceKey, appDataDatasourceList]);

  const apiSummaryLabel = useMemo(() => {
    if (selectedApiKey.startsWith('bp:')) {
      const api = savedApisList.find((x) => `bp:${x.id}` === selectedApiKey);
      return api ? `Blueprint API · ${api.name}` : 'Blueprint API';
    }
    if (selectedApiKey.startsWith('ext:')) {
      const id = selectedApiKey.slice(4);
      const ex = externalApisList.find((x) => x.id === id);
      return ex ? `External API · ${ex.name}` : 'External API';
    }
    return '';
  }, [selectedApiKey, savedApisList, externalApisList]);

  const workspaceDataSourceLabel = useMemo(() => {
    const parts = [datasourceLabel];
    if (apiSummaryLabel) parts.push(apiSummaryLabel);
    return parts.join(' · ');
  }, [datasourceLabel, apiSummaryLabel]);

  const signedIn = Boolean(getStudioAuthHeaders()['x-user-email']);

  const handlePickImages = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
    const maxBytes = 4 * 1024 * 1024;

    const readOne = (file: File): Promise<LandingComposeAttachment | null> =>
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
      const additions: LandingComposeAttachment[] = [];
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

  const buildPayloadFromForm = (): DesignStudioLaunchPayload => ({
    workspacePrompt: prompt.trim(),
    workspaceDataSourceLabel,
    llmProvider: resolvedLlm.provider,
    llmModel: resolvedLlm.model,
    llmProviderLabel: resolvedLlm.providerLabel,
    llmModelLabel: resolvedLlm.modelLabel,
    suggestedApiRef:
      selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:') ? selectedApiKey : undefined,
    initialSelectedDatasourceKey: selectedDatasourceKey.trim() || undefined,
    initialAttachments: composeAttachments.length > 0 ? composeAttachments.map((a) => ({ ...a })) : undefined,
    autoStartBuild: true,
  });

  const handleOpenStudio = () => {
    onOpenStudio(buildPayloadFromForm());
  };

  const openRemoteDashboard = (row: RemoteSavedDashboardRow) => {
    const p = row.payload;
    const prov = coerceCopilotProvider(p.llmProvider, workspaceLlmProvider);
    const model =
      typeof p.llmModel === 'string' && p.llmModel.trim()
        ? p.llmModel.trim()
        : (COPILOT_MODELS_BY_PROVIDER[prov]?.[0]?.value ?? workspaceLlmModel);
    const providerLabel = COPILOT_LLM_PROVIDERS.find((x) => x.id === prov)?.label ?? prov;
    const modelLabel =
      COPILOT_MODELS_BY_PROVIDER[prov]?.find((m) => m.value === model)?.label ?? model;
    const apiRef = p.selectedApiKey;
    onOpenStudio({
      workspacePrompt: (p.workspacePrompt || row.name || '').trim(),
      workspaceDataSourceLabel: p.workspaceDataSourceLabel?.trim() || workspaceDataSourceLabel,
      llmProvider: prov,
      llmModel: model,
      llmProviderLabel: providerLabel,
      llmModelLabel: modelLabel,
      suggestedApiRef:
        typeof apiRef === 'string' && (apiRef.startsWith('bp:') || apiRef.startsWith('ext:')) ? apiRef : undefined,
      initialSelectedDatasourceKey: p.selectedDatasourceKey?.trim() || undefined,
      autoStartBuild: false,
      savedRemoteDashboardId: row.id,
      initialProposalJson: typeof p.proposalJson === 'string' ? p.proposalJson : '',
      initialPublishedSlug: typeof p.publishedSlug === 'string' ? p.publishedSlug : null,
    });
  };

  const handleDeleteRemote = async (id: string) => {
    const headers = getStudioAuthHeaders();
    if (!headers['x-user-email']) return;
    try {
      await studioFetch(apiUrl(`/api/dashboards/${encodeURIComponent(id)}`), { method: 'DELETE', headers });
    } catch {
      /* ignore */
    }
    setRemoteSaved((prev) => prev.filter((x) => x.id !== id));
  };

  const builderSelectCls = `h-8 min-w-[140px] max-w-[220px] rounded-md border px-1.5 text-[10px] outline-none ${
    isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
  }`;
  const builderMenuTriggerCls = `${builderSelectCls} inline-flex w-auto shrink-0 items-center justify-between gap-1 text-left font-normal`;

  const datasourceMenuSections = useMemo((): StudioPopoverSelectSection[] => {
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

  const apiMenuSections = useMemo((): StudioPopoverSelectSection[] => {
    const clearRow: StudioPopoverSelectSection = {
      options: [{ value: '', label: 'API…' }],
    };
    if (savedApisList.length === 0 && externalApisList.length === 0) {
      return [clearRow];
    }
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

  const llmMenuSections = useMemo((): StudioPopoverSelectSection[] => {
    const options: { value: string; label: string }[] = [
      {
        value: WORKSPACE_LLM_VALUE,
        label: `${workspaceLlmProviderLabel} · ${workspaceLlmModelLabel}`,
      },
    ];
    for (const row of llmConfigsWithKey) {
      const p = String(row.provider || '').toLowerCase();
      const m = String(row.model_name || '').trim();
      if (!p || !m) continue;
      const val = llmChoiceFromSaved(p, m);
      options.push({ value: val, label: formatLlmRowLabel(p, m) });
    }
    return [{ options }];
  }, [
    llmConfigsWithKey,
    workspaceLlmProviderLabel,
    workspaceLlmModelLabel,
  ]);

  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className={`mx-auto w-full max-w-[1280px] px-4 sm:px-6 py-8 ${isDarkMode ? 'bg-slate-950 text-slate-100 min-h-full' : 'bg-slate-50 text-slate-900 min-h-full'}`}
    >
      <section className="mx-auto">
        <h1 className={`text-center text-[34px] leading-tight font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          What dashboard do you want to design?
        </h1>

        <div
          className={`mt-6 rounded-2xl border p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900 shadow-[0_3px_10px_rgba(2,6,23,0.45)]' : 'border-slate-200 bg-white shadow-[0_3px_10px_rgba(15,23,42,0.04)]'}`}
        >
          <p className={`text-[11px] ${muted}`}>
            Selected workspace:{' '}
            <span className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{workspaceDataSourceLabel}</span>
          </p>

          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handleComposePaste}
            placeholder="Describe metrics, layout, audience, and interactions. Paste or attach mockups below…"
            className={`mt-4 w-full resize-none bg-transparent text-sm border-none outline-none ${isDarkMode ? 'text-slate-200 placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`}
          />

          {composeAttachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {composeAttachments.map((a) => (
                <div key={a.id} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
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

          <div className="mt-3 flex flex-nowrap items-center gap-3 overflow-x-auto">
            <div
              className={`flex shrink-0 flex-nowrap items-center justify-start gap-3 overflow-x-auto ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
            >
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
              <button
                type="button"
                onClick={() => composeImageInputRef.current?.click()}
                aria-label="Attach images"
                title="Attach images"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isDarkMode
                    ? 'border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <ImageIcon className="h-4 w-4" />
              </button>

              <StudioPopoverSelect
                ariaLabel="Datasource"
                disabled={appDataDsBusy}
                isDarkMode={isDarkMode}
                value={selectedDatasourceKey}
                placeholder="Datasource…"
                sections={datasourceMenuSections}
                onMenuOpen={() => void refreshAppDataDatasources()}
                onChange={(v) => setSelectedDatasourceKey(v)}
                triggerClassName={builderMenuTriggerCls}
              />

              <StudioPopoverSelect
                ariaLabel="API"
                isDarkMode={isDarkMode}
                value={selectedApiKey.startsWith('bp:') || selectedApiKey.startsWith('ext:') ? selectedApiKey : ''}
                placeholder="API…"
                sections={apiMenuSections}
                onMenuOpen={() => void refreshApis()}
                onChange={(v) => setSelectedApiKey(v)}
                triggerClassName={builderMenuTriggerCls}
              />

              <StudioPopoverSelect
                ariaLabel="LLM"
                disabled={llmCatalogLoading}
                isDarkMode={isDarkMode}
                value={llmSelectValue}
                placeholder="LLM…"
                sections={llmMenuSections}
                onChange={(v) => setLlmSelectValue(v)}
                triggerClassName={builderMenuTriggerCls}
              />
            </div>

            <div className="min-w-[12px] flex-1 shrink" aria-hidden />

            <button
              type="button"
              onClick={handleOpenStudio}
              className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-b from-[#6675ff] to-[#4f46e5] text-white ring-1 ring-[#7c87ff]/40 inline-flex items-center justify-center"
              title="Open Design Studio"
              aria-label="Open Design Studio"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>

        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className={`text-[10px] uppercase tracking-[0.16em] ${muted}`}>Saved dashboards</p>
          {remoteSavedBusy ? (
            <span className={`inline-flex items-center gap-1 text-[10px] ${muted}`}>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {!signedIn ? (
            <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              Sign in to list dashboards saved from Design Studio.
            </div>
          ) : remoteSavedBusy && remoteSaved.length === 0 ? (
            <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                Loading saved dashboards…
              </span>
            </div>
          ) : remoteSaved.length === 0 ? (
            <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              No saved dashboards yet — generate one in the studio, then use Save dashboard.
            </div>
          ) : (
            remoteSaved.map((row) => (
              <div
                key={row.id}
                className={`rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-0.5 ${isDarkMode ? 'border-slate-800 bg-slate-900 hover:shadow-sm hover:border-slate-700' : 'border-slate-200 bg-white hover:shadow-sm hover:border-slate-300'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => openRemoteDashboard(row)}
                    className="min-w-0 text-left"
                    title={`Open ${row.name}`}
                  >
                    <div className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                      <LayoutGrid className="w-3 h-3 text-violet-500" />
                      <span>Dashboard</span>
                    </div>
                    <p className={`mt-2 truncate text-[13px] leading-5 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {row.name || 'Untitled dashboard'}
                    </p>
                    <p className={`mt-1 line-clamp-2 text-[12px] leading-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {row.payload.workspacePrompt?.trim() || 'Saved specification'}
                    </p>
                    <p className={`mt-2 text-[10px] ${muted}`}>
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRemote(row.id)}
                    className="inline-flex shrink-0 items-center rounded p-1 text-rose-400 hover:text-rose-300"
                    title="Delete dashboard"
                    aria-label={`Delete ${row.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
