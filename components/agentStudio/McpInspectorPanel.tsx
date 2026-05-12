import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Plus,
  Search,
  X,
  Zap,
} from 'lucide-react';

import type { AgentNodeData } from './agentNodeData';
import type { McpCatalogEntry } from './mcpCatalog';
import {
  MCP_CATALOG_ALL,
  lookupMcpCatalogEntry,
  mcpPresetDisplayTitle,
  resolveMcpAccessTokenHelpUrl,
} from './mcpCatalog';
import { McpSquiggleLogo } from './McpSquiggleLogo';
import { McpBrandLogo } from './McpBrandLogo';

import { apiUrl, readApiJson, studioFetch } from '../../lib/apiBase';

const AUTH_OPTIONS = [{ id: 'access_token', label: 'Access token / API key' }] as const;

function inputCls(isDark: boolean) {
  return `w-full rounded-md border px-2 py-2 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
  }`;
}

function labelCls(isDark: boolean) {
  return isDark ? 'text-slate-400' : 'text-slate-600';
}

function CatalogTile({
  entry,
  onPick,
}: {
  entry: McpCatalogEntry;
  onPick: (e: McpCatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500"
    >
      <McpBrandLogo logoSlug={entry.logoSlug} label={entry.name} size="md" rounded="lg" />
      <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">{entry.name}</span>
    </button>
  );
}

export function McpInspectorPanel({
  data,
  isDarkMode,
  onPatch,
}: {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [connectPhase, setConnectPhase] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [connectMessage, setConnectMessage] = useState('');

  const transport = String(data.transport || 'http');

  useEffect(() => {
    setConnectPhase('idle');
    setConnectMessage('');
  }, [data.serverUrl, transport, data.mcpAccessToken]);

  const onConnectTest = useCallback(async () => {
    if (!String(data.serverUrl ?? '').trim()) {
      setConnectPhase('error');
      setConnectMessage('Enter a server URL first.');
      return;
    }
    if (transport === 'stdio') {
      setConnectPhase('error');
      setConnectMessage(
        'Connection check is only available for HTTP and SSE transports. stdio MCP runs locally in your environment.'
      );
      return;
    }
    setConnectPhase('loading');
    setConnectMessage('');
    try {
      const resp = await studioFetch(apiUrl('/api/agent-studio/mcp/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: String(data.serverUrl ?? '').trim(),
          transport,
          accessToken: String(data.mcpAccessToken ?? '').trim(),
        }),
      });
      const j = await readApiJson<{ ok?: boolean; error?: string; detail?: string }>(resp);
      if (j.ok === true) {
        setConnectPhase('success');
        setConnectMessage(j.detail ?? 'Connected successfully.');
        return;
      }
      setConnectPhase('error');
      setConnectMessage(typeof j?.error === 'string' ? j.error : 'Connection test failed.');
    } catch (e) {
      setConnectPhase('error');
      setConnectMessage(e instanceof Error ? e.message : String(e));
    }
  }, [data.serverUrl, data.mcpAccessToken, transport]);

  const preset = lookupMcpCatalogEntry(data.mcpCatalogId);
  const displayTitle = mcpPresetDisplayTitle(data.mcpCatalogId, data.mcpServerLabel);
  const accessTokenHelpHref = useMemo(
    () => resolveMcpAccessTokenHelpUrl(data.mcpCatalogId),
    [data.mcpCatalogId]
  );

  const onPickPreset = useCallback(
    (entry: McpCatalogEntry) => {
      const patch: Partial<AgentNodeData> = {
        mcpCatalogId: entry.id,
        mcpServerLabel: entry.name.toLowerCase().replace(/\s+/g, '_'),
      };
      const curUrl = String(data.serverUrl ?? '').trim();
      if (!curUrl) {
        patch.serverUrl = '';
      }
      onPatch(patch);
      setCatalogOpen(false);
      setQuery('');
    },
    [data.serverUrl, onPatch]
  );

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MCP_CATALOG_ALL.filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [query]);

  const ic = inputCls(isDarkMode);
  const lc = labelCls(isDarkMode);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`shrink-0 border-b px-3 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="flex flex-col items-center gap-3 text-center">
          {preset ? (
            <McpBrandLogo logoSlug={preset.logoSlug} label={preset.name} size="lg" rounded="xl" />
          ) : (
            <McpSquiggleLogo />
          )}
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>Connect to MCP Server</h2>
            <p className={`mt-1 text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{displayTitle}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
              isDarkMode ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-800/80' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Add MCP server…
          </button>
          <button
            type="button"
            title="Clears preset; keep URL and credentials."
            onClick={() => onPatch({ mcpCatalogId: 'custom', mcpServerLabel: String(data.mcpServerLabel ?? '') })}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-medium ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <label className={`block ${lc}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">URL</span>
          <input
            value={String(data.serverUrl ?? '')}
            onChange={(e) => onPatch({ serverUrl: e.target.value })}
            className={`${ic} font-mono text-[11px]`}
            placeholder="https://mcp.example.com"
            autoComplete="off"
          />
          <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-500">Only use MCP servers you trust and verify.</span>
        </label>

        <label className={`block ${lc}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Label</span>
          <input
            value={String(data.mcpServerLabel ?? '')}
            onChange={(e) => onPatch({ mcpServerLabel: e.target.value })}
            className={ic}
            placeholder="my_mcp_server"
            autoComplete="off"
          />
        </label>

        <label className={`block ${lc}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Description (optional)</span>
          <input
            value={String(data.mcpDescription ?? '')}
            onChange={(e) => onPatch({ mcpDescription: e.target.value })}
            className={ic}
            placeholder="My MCP Server"
            autoComplete="off"
          />
        </label>

        <label className={`block ${lc}`}>
          <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
            Authentication
            <span title="How this server authenticates outbound requests." className="cursor-help">
              <Info className="h-3 w-3 text-slate-400" />
            </span>
          </span>
          <select
            value={String(data.mcpAuthType ?? AUTH_OPTIONS[0].id)}
            onChange={(e) => onPatch({ mcpAuthType: e.target.value as AgentNodeData['mcpAuthType'] })}
            className={ic}
          >
            {AUTH_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {(data.mcpAuthType ?? 'access_token') === 'access_token' && (
          <>
            <div
              className={`flex flex-col gap-1 rounded-lg border px-2.5 py-2 ${
                isDarkMode ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <a
                href={accessTokenHelpHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold shadow-sm transition-colors ${
                  isDarkMode
                    ? 'border-slate-600 bg-slate-800 text-sky-300 hover:bg-slate-800/90 hover:text-sky-200'
                    : 'border-slate-200 bg-white text-sky-700 hover:bg-sky-50'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Get access token
              </a>
              <p className={`text-center text-[10px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                {preset
                  ? `Opens the ${preset.name} site to obtain API keys or OAuth credentials.`
                  : 'Opens Model Context Protocol resources. Pick a catalog preset for a direct link to that provider.'}
              </p>
            </div>

            <label className={`block ${lc}`}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Credential</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  value={String(data.mcpAccessToken ?? '')}
                  onChange={(e) => onPatch({ mcpAccessToken: e.target.value })}
                  className={`${ic} pl-8 pr-9 font-mono text-[11px]`}
                  placeholder="Add your access token"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setTokenVisible((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  title={tokenVisible ? 'Hide' : 'Show'}
                >
                  {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>
          </>
        )}

        <label className={`block ${lc}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Transport</span>
          <select
            value={String(data.transport || 'http')}
            onChange={(e) => onPatch({ transport: e.target.value })}
            className={ic}
          >
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio">stdio</option>
          </select>
        </label>

        <div className="flex w-full flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={() => void onConnectTest()}
            disabled={connectPhase === 'loading'}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold shadow-sm transition-colors disabled:opacity-70 ${
              isDarkMode
                ? 'bg-slate-100 text-slate-900 hover:bg-white disabled:hover:bg-slate-100'
                : 'bg-slate-900 text-white hover:bg-slate-800 disabled:hover:bg-slate-900'
            }`}
            title="Runs MCP initialize against your URL (via the Xerocode API)."
          >
            {connectPhase === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
            ) : (
              <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Connect
          </button>
          {connectPhase === 'success' && connectMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium leading-snug ${
                isDarkMode
                  ? 'border-emerald-800/70 bg-emerald-950/50 text-emerald-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              {connectMessage}
            </p>
          )}
          {connectPhase === 'error' && connectMessage && (
            <p
              role="alert"
              aria-live="assertive"
              className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium leading-snug ${
                isDarkMode
                  ? 'border-rose-800/70 bg-rose-950/40 text-rose-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              {connectMessage}
            </p>
          )}
          <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            Runs a server-side connection test — start the API (e.g. <code className="font-mono text-[10px]">npm run dev:api</code>)
            while using Vite.
          </p>
        </div>
      </div>

      {catalogOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-catalog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCatalogOpen(false);
          }}
        >
          <div
            className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h2 id="mcp-catalog-title" className="text-base font-semibold">
                Add MCP server
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onPatch({ mcpCatalogId: 'custom' });
                    setCatalogOpen(false);
                    setQuery('');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800'}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Server
                  </span>
                </button>
                <button
                  type="button"
                  title="Close"
                  onClick={() => setCatalogOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className={`border-b px-4 py-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search servers…"
                  className={`w-full rounded-lg border py-1.5 pl-8 pr-3 text-[11px] outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}
                />
              </div>
            </div>

            <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div
                className={`rounded-xl border p-3 ${isDarkMode ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filteredCatalog.map((e) => (
                    <CatalogTile key={e.id} entry={e} onPick={onPickPreset} />
                  ))}
                </div>
              </div>
            </div>

            <div className={`flex items-center gap-2 border-t px-4 py-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                  isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                }`}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
