import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Code2, Database, Edit3, Pencil, Server, Zap } from 'lucide-react';
import { expandSavedApiEndpoints, readSavedApis, writeSavedApis, type SavedApi } from '../lib/savedApis';
import {
  hasWorkspaceAuth,
  loadBlueprintApisWorkspace,
  mirrorBlueprintApisLocal,
  upsertBlueprintApiWorkspace,
} from '../lib/workspaceApis';
import { SavedApiEndpointsGrid } from './SavedApiEndpointsGrid';
import { SavedApiRunDrawer, createSavedApiRunState, type SavedApiRunState } from './SavedApiRunDrawer';

type Props = {
  api: SavedApi;
  isDarkMode: boolean;
  onBack: () => void;
  onEditApi: (api: SavedApi) => void;
};

const formatTimeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(ts).toLocaleDateString();
};

export const ApiSavedDetailScreen: React.FC<Props> = ({ api: apiProp, isDarkMode, onBack, onEditApi }) => {
  const [api, setApi] = useState(apiProp);
  const [runState, setRunState] = useState<SavedApiRunState | null>(null);

  useEffect(() => {
    setApi(apiProp);
    const fresh = readSavedApis().find((a) => a.id === apiProp.id);
    if (fresh) setApi(fresh);
  }, [apiProp]);

  useEffect(() => {
    if (!hasWorkspaceAuth()) return;
    let cancelled = false;
    void loadBlueprintApisWorkspace()
      .then((list) => {
        if (cancelled) return;
        mirrorBlueprintApisLocal(list);
        const fresh = list.find((a) => a.id === apiProp.id);
        if (fresh) setApi(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiProp.id]);

  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const cardBg = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';

  const endpoints = useMemo(() => expandSavedApiEndpoints(api), [api]);

  const handleDuplicate = async () => {
    const copy: SavedApi = {
      ...api,
      id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${api.name} (copy)`,
      savedAt: Date.now(),
    };
    const next = [copy, ...readSavedApis()];
    if (hasWorkspaceAuth()) {
      try {
        await upsertBlueprintApiWorkspace(copy);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Could not save duplicate to server.');
        return;
      }
    }
    writeSavedApis(next);
    mirrorBlueprintApisLocal(next);
  };

  return (
    <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${isDarkMode ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to list
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className={`hidden h-5 w-5 shrink-0 sm:inline ${isDarkMode ? 'text-violet-300' : 'text-violet-500'}`} />
              <h1 className={`truncate text-base font-semibold ${heading}`}>{api.name}</h1>
            </div>
            <p className={`mt-0.5 text-[11px] ${subText}`}>
              {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'} · saved {formatTimeAgo(api.savedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDuplicate}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            type="button"
            onClick={() => onEditApi(api)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit in builder
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className={`mb-4 rounded-xl border p-4 ${cardBg}`}>
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-[200px] flex-1 items-start gap-2">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDarkMode ? 'bg-violet-500/15 text-violet-200' : 'bg-violet-50 text-violet-600'}`}
              >
                <Code2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Mode</p>
                <span
                  className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
              </div>
            </div>
            <div className="flex min-w-[200px] flex-1 items-start gap-2">
              <Database className={`mt-1 h-4 w-4 shrink-0 opacity-70 ${subText}`} />
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Data source</p>
                <p className={`mt-1 font-medium ${heading}`}>{api.connection?.friendly_name || '—'}</p>
                {api.connection?.database_name ? (
                  <p className={`mt-0.5 font-mono text-[11px] ${subText}`}>{api.connection.database_name}</p>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-[160px] flex-1 items-start gap-2">
              <Server className={`mt-1 h-4 w-4 shrink-0 ${subText}`} />
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Tables</p>
                <p className={`mt-1 ${heading}`}>
                  {api.tables.length} table{api.tables.length === 1 ? '' : 's'}
                </p>
                <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${subText}`}>
                  <Zap className="h-3 w-3" />
                  {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className={`mb-3 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Endpoints</p>
        <SavedApiEndpointsGrid
          api={api}
          isDarkMode={isDarkMode}
          onRun={(a, ep) => setRunState(createSavedApiRunState(a, ep))}
          emptyHint={
            <>
              No endpoints enabled. Click <strong className={heading}>Edit in builder</strong> to enable HTTP methods.
            </>
          }
        />
      </div>

      <SavedApiRunDrawer isDarkMode={isDarkMode} runState={runState} setRunState={setRunState} />
    </div>
  );
};

export default ApiSavedDetailScreen;
