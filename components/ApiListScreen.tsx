import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Code2,
  Database,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Zap,
} from 'lucide-react';
import { expandSavedApiEndpoints, readSavedApis, removeSavedApi, type SavedApi } from '../lib/savedApis';
import {
  readExternalApis,
  removeExternalApi,
  type ExternalApiDefinition,
} from '../lib/externalApis';
import {
  deleteBlueprintApiWorkspace,
  deleteExternalApiWorkspace,
  hasWorkspaceAuth,
  loadBlueprintApisWorkspace,
  loadExternalApisWorkspace,
  migrateLocalBlueprintApisIfRemoteEmpty,
  migrateLocalExternalApisIfRemoteEmpty,
  mirrorBlueprintApisLocal,
  mirrorExternalApisLocal,
} from '../lib/workspaceApis';

type Props = {
  isDarkMode: boolean;
  onBack: () => void;
  onEditApi: (api: SavedApi) => void;
  onCreateNew: () => void;
  onViewApi: (api: SavedApi) => void;
  onAddExternalApi: () => void;
  onOpenExternalApi: (id: string) => void;
};

const formatTimeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(ts).toLocaleDateString();
};

export const ApiListScreen: React.FC<Props> = ({
  isDarkMode,
  onBack,
  onEditApi,
  onCreateNew,
  onViewApi,
  onAddExternalApi,
  onOpenExternalApi,
}) => {
  const [savedApis, setSavedApis] = useState<SavedApi[]>(() => readSavedApis());
  const [externalApis, setExternalApis] = useState<ExternalApiDefinition[]>(() => readExternalApis());
  const [listTab, setListTab] = useState<'blueprint' | 'external'>(() => {
    const s = readSavedApis().length;
    const e = readExternalApis().length;
    return s === 0 && e > 0 ? 'external' : 'blueprint';
  });
  const [searchBlueprint, setSearchBlueprint] = useState('');
  const [searchExternal, setSearchExternal] = useState('');

  const loadFromWorkspace = useCallback(async () => {
    if (!hasWorkspaceAuth()) {
      setSavedApis(readSavedApis());
      setExternalApis(readExternalApis());
      return;
    }
    try {
      await migrateLocalBlueprintApisIfRemoteEmpty();
      await migrateLocalExternalApisIfRemoteEmpty();
      const [bp, ext] = await Promise.all([loadBlueprintApisWorkspace(), loadExternalApisWorkspace()]);
      mirrorBlueprintApisLocal(bp);
      mirrorExternalApisLocal(ext);
      setSavedApis(bp);
      setExternalApis(ext);
    } catch {
      setSavedApis(readSavedApis());
      setExternalApis(readExternalApis());
    }
  }, []);

  const refresh = () => {
    void loadFromWorkspace();
  };

  useEffect(() => {
    void loadFromWorkspace();
  }, [loadFromWorkspace]);

  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const cardBg = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';
  const gridBorder = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const gridHeaderBg = isDarkMode ? 'bg-slate-900/95' : 'bg-slate-100';
  const gridRowHover = isDarkMode ? 'hover:bg-slate-900/80' : 'hover:bg-slate-50';
  const gridCell = `border px-3 py-2.5 text-left align-middle text-[12px] ${gridBorder}`;
  const inputClasses = `h-9 w-full rounded-md border px-3 text-xs outline-none ${
    isDarkMode
      ? 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:border-violet-500'
      : 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-violet-400'
  }`;

  const filteredBuiltIn = useMemo(() => {
    const q = searchBlueprint.trim().toLowerCase();
    if (!q) return savedApis;
    return savedApis.filter((api) => {
      if (api.name.toLowerCase().includes(q)) return true;
      if (api.connection?.friendly_name?.toLowerCase().includes(q)) return true;
      if (api.connection?.database_name?.toLowerCase().includes(q)) return true;
      return api.tables.some((t) => t.table.toLowerCase().includes(q));
    });
  }, [savedApis, searchBlueprint]);

  const filteredExternal = useMemo(() => {
    const q = searchExternal.trim().toLowerCase();
    if (!q) return externalApis;
    return externalApis.filter((ex) => {
      if (ex.name.toLowerCase().includes(q)) return true;
      if (ex.url.toLowerCase().includes(q)) return true;
      if (ex.method.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [externalApis, searchExternal]);

  const blueprintCount = savedApis.length;
  const externalCount = externalApis.length;
  const filteredBlueprint = filteredBuiltIn.length;
  const filteredExternalCount = filteredExternal.length;

  const handleDeleteSaved = async (api: SavedApi) => {
    const ok = window.confirm(`Delete "${api.name}"? This cannot be undone.`);
    if (!ok) return;
    if (hasWorkspaceAuth()) {
      try {
        await deleteBlueprintApiWorkspace(api.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Delete failed.');
        return;
      }
    }
    const next = removeSavedApi(api.id);
    mirrorBlueprintApisLocal(next);
    setSavedApis(next);
  };

  const handleDeleteExternal = async (ex: ExternalApiDefinition) => {
    const ok = window.confirm(`Delete external request "${ex.name}"?`);
    if (!ok) return;
    if (hasWorkspaceAuth()) {
      try {
        await deleteExternalApiWorkspace(ex.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Delete failed.');
        return;
      }
    }
    const next = removeExternalApi(ex.id);
    mirrorExternalApisLocal(next);
    setExternalApis(next);
  };

  const emptyAll = savedApis.length === 0 && externalApis.length === 0;

  return (
    <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${isDarkMode ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex items-center gap-2">
          <BookOpen className={`h-5 w-5 shrink-0 ${isDarkMode ? 'text-violet-300' : 'text-violet-500'}`} />
          <div>
            <h1 className={`text-base font-semibold ${heading}`}>Saved APIs</h1>
            <p className={`text-[11px] ${subText}`}>
              {hasWorkspaceAuth()
                ? 'Blueprint & external requests load from your account (SQL Server control database xerocode).'
                : 'Sign in to sync Saved APIs across devices. Until then, lists use this browser only.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddExternalApi}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold ${
              isDarkMode
                ? 'border-orange-500/50 bg-orange-500/15 text-orange-100 hover:bg-orange-500/25'
                : 'border-orange-400 bg-orange-50 text-orange-900 hover:bg-orange-100'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" /> Add external API
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-600 px-2.5 text-[11px] font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="h-3.5 w-3.5" /> New API
          </button>
          <button
            type="button"
            onClick={refresh}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        </div>
      </header>

      {!emptyAll ? (
        <>
          <div className={`flex shrink-0 gap-0 border-b ${isDarkMode ? 'border-slate-900 bg-slate-950' : 'border-slate-200 bg-white'} px-4`}>
            <button
              type="button"
              onClick={() => setListTab('blueprint')}
              className={`relative border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                listTab === 'blueprint'
                  ? isDarkMode
                    ? 'border-violet-500 text-violet-200'
                    : 'border-violet-600 text-violet-700'
                  : isDarkMode
                    ? 'border-transparent text-slate-400 hover:text-slate-300'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Blueprint APIs
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                {blueprintCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setListTab('external')}
              className={`relative border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                listTab === 'external'
                  ? isDarkMode
                    ? 'border-orange-400 text-orange-200'
                    : 'border-orange-500 text-orange-800'
                  : isDarkMode
                    ? 'border-transparent text-slate-400 hover:text-slate-300'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              External APIs
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                {externalCount}
              </span>
            </button>
          </div>

          <div className={`flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center ${isDarkMode ? 'border-slate-900 bg-slate-950' : 'border-slate-200 bg-white'}`}>
            <div className="relative min-w-0 flex-1">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${subText}`} />
              {listTab === 'blueprint' ? (
                <input
                  type="search"
                  placeholder="Search blueprint APIs by name, data source, or table…"
                  value={searchBlueprint}
                  onChange={(e) => setSearchBlueprint(e.target.value)}
                  className={`${inputClasses} h-10 w-full pl-10 text-[13px]`}
                  autoComplete="off"
                  aria-label="Search blueprint APIs"
                />
              ) : (
                <input
                  type="search"
                  placeholder="Search external APIs by name, URL, or HTTP method…"
                  value={searchExternal}
                  onChange={(e) => setSearchExternal(e.target.value)}
                  className={`${inputClasses} h-10 w-full pl-10 text-[13px]`}
                  autoComplete="off"
                  aria-label="Search external APIs"
                />
              )}
            </div>
            <span className={`shrink-0 text-[12px] ${subText}`}>
              {listTab === 'blueprint'
                ? `${filteredBlueprint} of ${blueprintCount} shown`
                : `${filteredExternalCount} of ${externalCount} shown`}
            </span>
          </div>
        </>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {emptyAll ? (
          <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-20 text-center ${cardBg}`}>
            <BookOpen className={`h-12 w-12 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h2 className={`text-base font-semibold ${heading}`}>No APIs yet</h2>
            <p className={`max-w-md text-sm ${subText}`}>
              Save a blueprint from API Builder, or add an external URL to try requests in a Postman-style client.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onAddExternalApi}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
                  isDarkMode
                    ? 'border-orange-500/50 bg-orange-500/15 text-orange-100 hover:bg-orange-500/25'
                    : 'border-orange-400 bg-orange-50 text-orange-900 hover:bg-orange-100'
                }`}
              >
                <Link2 className="h-4 w-4" /> Add external API
              </button>
              <button
                type="button"
                onClick={onCreateNew}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" /> New blueprint API
              </button>
            </div>
          </div>
        ) : listTab === 'blueprint' && blueprintCount === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-20 text-center ${cardBg}`}>
            <Code2 className={`h-12 w-12 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h2 className={`text-base font-semibold ${heading}`}>No blueprint APIs yet</h2>
            <p className={`max-w-md text-sm ${subText}`}>Save a configuration from API Builder to list tables and published endpoints here.</p>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" /> New blueprint API
            </button>
          </div>
        ) : listTab === 'external' && externalCount === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-20 text-center ${cardBg}`}>
            <Link2 className={`h-12 w-12 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h2 className={`text-base font-semibold ${heading}`}>No external APIs yet</h2>
            <p className={`max-w-md text-sm ${subText}`}>Add a URL and send requests in a Postman-style client (saved locally).</p>
            <button
              type="button"
              onClick={onAddExternalApi}
              className={`mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
                isDarkMode
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-100 hover:bg-orange-500/25'
                  : 'border-orange-400 bg-orange-50 text-orange-900 hover:bg-orange-100'
              }`}
            >
              <Link2 className="h-4 w-4" /> Add external API
            </button>
          </div>
        ) : listTab === 'blueprint' && filteredBlueprint === 0 ? (
          <div className={`rounded-xl border px-6 py-16 text-center ${cardBg}`}>
            <p className={`text-sm ${subText}`}>Nothing matches &quot;{searchBlueprint}&quot; in blueprint APIs.</p>
          </div>
        ) : listTab === 'external' && filteredExternalCount === 0 ? (
          <div className={`rounded-xl border px-6 py-16 text-center ${cardBg}`}>
            <p className={`text-sm ${subText}`}>Nothing matches &quot;{searchExternal}&quot; in external APIs.</p>
          </div>
        ) : listTab === 'blueprint' ? (
          <div className={`overflow-hidden rounded-xl border ${gridBorder} ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className={gridHeaderBg}>
                    <th className={`${gridCell} font-semibold ${heading}`}>API name</th>
                    <th className={`${gridCell} font-semibold ${heading}`}>Data source</th>
                    <th className={`${gridCell} font-semibold ${heading}`}>Summary</th>
                    <th className={`${gridCell} w-[96px] whitespace-nowrap font-semibold ${heading}`}>View</th>
                    <th className={`${gridCell} w-[96px] whitespace-nowrap font-semibold ${heading}`}>Edit</th>
                    <th className={`${gridCell} w-[96px] whitespace-nowrap font-semibold ${heading}`}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuiltIn.map((api) => {
                    const endpoints = expandSavedApiEndpoints(api);
                    return (
                      <tr key={api.id} className={`${gridRowHover} ${isDarkMode ? 'bg-black/40' : ''}`}>
                        <td className={gridCell}>
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDarkMode ? 'bg-violet-500/15 text-violet-200' : 'bg-violet-50 text-violet-600'}`}
                            >
                              <Code2 className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className={`font-semibold ${heading}`}>{api.name}</div>
                              <div className={`mt-0.5 flex flex-wrap gap-2 text-[10px] ${subText}`}>
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${
                                    api.apiMode === 'combined'
                                      ? isDarkMode
                                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                                        : 'border-amber-300 bg-amber-50 text-amber-700'
                                      : isDarkMode
                                        ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                                        : 'border-sky-300 bg-sky-50 text-sky-700'
                                  }`}
                                >
                                  {api.apiMode === 'combined' ? 'Combined' : 'Per-table'}
                                </span>
                                <span>Saved {formatTimeAgo(api.savedAt)}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`${gridCell} ${subText}`}>
                          <span className={`flex items-center gap-1.5 ${heading}`}>
                            <Database className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span className="break-words">{api.connection?.friendly_name || '—'}</span>
                          </span>
                          {api.connection?.database_name ? (
                            <div className={`mt-1 font-mono text-[11px] ${subText}`}>{api.connection.database_name}</div>
                          ) : null}
                        </td>
                        <td className={`${gridCell} ${subText}`}>
                          <span className="inline-flex items-center gap-1">
                            <Server className="h-3.5 w-3.5" />
                            {api.tables.length} table{api.tables.length === 1 ? '' : 's'}
                          </span>
                          <span className="mt-1 ml-5 flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" />
                            {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className={`${gridCell} whitespace-nowrap`}>
                          <button
                            type="button"
                            onClick={() => onViewApi(api)}
                            className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium ${
                              isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title="Open endpoints on full screen"
                          >
                            View
                          </button>
                        </td>
                        <td className={`${gridCell} whitespace-nowrap`}>
                          <button
                            type="button"
                            onClick={() => onEditApi(api)}
                            className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-violet-600 px-2 text-[11px] font-semibold text-white hover:bg-violet-500"
                            title="Open in API Builder"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        </td>
                        <td className={`${gridCell} whitespace-nowrap`}>
                          <button
                            type="button"
                            onClick={() => handleDeleteSaved(api)}
                            className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-rose-600 px-2 text-[11px] font-semibold text-white hover:bg-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`overflow-hidden rounded-xl border ${gridBorder} ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className={gridHeaderBg}>
                    <th className={`${gridCell} font-semibold ${heading}`}>Name</th>
                    <th className={`${gridCell} font-semibold ${heading}`}>Method · URL</th>
                    <th className={`${gridCell} w-[120px] whitespace-nowrap font-semibold ${heading}`}>Open client</th>
                    <th className={`${gridCell} w-[96px] whitespace-nowrap font-semibold ${heading}`}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExternal.map((ex) => (
                    <tr key={ex.id} className={`${gridRowHover} ${isDarkMode ? 'bg-black/40' : ''}`}>
                      <td className={gridCell}>
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDarkMode ? 'bg-orange-500/15 text-orange-200' : 'bg-orange-50 text-orange-700'}`}
                          >
                            <Link2 className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className={`font-semibold ${heading}`}>{ex.name}</div>
                            <div className={`mt-0.5 text-[10px] ${subText}`}>Saved {formatTimeAgo(ex.savedAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${gridCell} max-w-[420px]`}>
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          {ex.method}
                        </span>
                        <div className={`mt-1 font-mono text-[11px] break-all ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{ex.url || '—'}</div>
                      </td>
                      <td className={`${gridCell} whitespace-nowrap`}>
                        <button
                          type="button"
                          onClick={() => onOpenExternalApi(ex.id)}
                          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-[#0969da] px-2 text-[11px] font-semibold text-white hover:bg-[#0860ca]"
                        >
                          Open
                        </button>
                      </td>
                      <td className={`${gridCell} whitespace-nowrap`}>
                        <button
                          type="button"
                          onClick={() => handleDeleteExternal(ex)}
                          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-rose-600 px-2 text-[11px] font-semibold text-white hover:bg-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiListScreen;
