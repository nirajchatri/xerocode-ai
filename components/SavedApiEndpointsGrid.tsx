import React from 'react';
import { Copy, Play } from 'lucide-react';
import {
  expandSavedApiEndpoints,
  type SavedApi,
  type SavedEndpoint,
  type ApiHttpMethod,
} from '../lib/savedApis';

export const METHOD_TONE: Record<ApiHttpMethod, { light: string; dark: string }> = {
  GET: {
    light: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    dark: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  },
  POST: {
    light: 'border-sky-300 bg-sky-50 text-sky-700',
    dark: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
  },
  PUT: {
    light: 'border-amber-300 bg-amber-50 text-amber-700',
    dark: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
  },
  PATCH: {
    light: 'border-violet-300 bg-violet-50 text-violet-700',
    dark: 'border-violet-500/40 bg-violet-500/15 text-violet-200',
  },
  DELETE: {
    light: 'border-rose-300 bg-rose-50 text-rose-700',
    dark: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
  },
};

const stripTrailingSlash = (s: string): string => (s.endsWith('/') ? s.slice(0, -1) : s);

export const buildSavedApiFullUrl = (publicBase: string, path: string): string => {
  const base = stripTrailingSlash((publicBase || '').trim()) || 'https://api.example.com';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};

type Props = {
  api: SavedApi;
  isDarkMode: boolean;
  onRun: (api: SavedApi, ep: SavedEndpoint) => void;
  /** Shown when no endpoints (optional React node). */
  emptyHint?: React.ReactNode;
  onCopyUrl?: (url: string) => void;
};

export const SavedApiEndpointsGrid: React.FC<Props> = ({
  api,
  isDarkMode,
  onRun,
  emptyHint,
  onCopyUrl,
}) => {
  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const cardBg = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';
  const gridBorder = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const gridHeaderBg = isDarkMode ? 'bg-slate-900/95' : 'bg-slate-100';
  const gridRowHover = isDarkMode ? 'hover:bg-slate-900/80' : 'hover:bg-slate-50';
  const gridCell = `border px-3 py-2.5 text-left align-middle text-[12px] ${gridBorder}`;

  const endpoints = expandSavedApiEndpoints(api);

  const copy = (url: string) => {
    if (onCopyUrl) {
      onCopyUrl(url);
      return;
    }
    try {
      void navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  if (endpoints.length === 0) {
    return (
      <div className={`rounded-lg border px-4 py-10 text-center text-[12px] ${cardBg} ${subText}`}>
        {emptyHint ?? (
          <>
            No endpoints enabled. Click <strong className={heading}>Edit</strong> to open API Builder and enable HTTP methods.
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${gridBorder} ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className={`${gridHeaderBg} sticky top-0 z-[1]`}>
              <th className={`${gridCell} whitespace-nowrap font-semibold ${heading}`}>Method</th>
              <th className={`${gridCell} whitespace-nowrap font-semibold ${heading}`}>Table</th>
              <th className={`${gridCell} font-semibold ${heading}`}>Path · URL</th>
              <th className={`${gridCell} w-[88px] whitespace-nowrap font-semibold ${heading}`}>Copy</th>
              <th className={`${gridCell} w-[88px] whitespace-nowrap font-semibold ${heading}`}>Run</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => {
              const tone = METHOD_TONE[ep.method];
              const url = buildSavedApiFullUrl(api.publicBaseUrl, ep.path);
              return (
                <tr key={`${api.id}-${ep.scope}-${ep.method}-${ep.path}`} className={gridRowHover}>
                  <td className={`${gridCell} whitespace-nowrap`}>
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                        isDarkMode ? tone.dark : tone.light
                      }`}
                    >
                      {ep.method}
                    </span>
                  </td>
                  <td className={`${gridCell} whitespace-nowrap`}>
                    <span className={`font-medium ${heading}`}>{ep.scope}</span>
                    {ep.combined ? <span className={`ml-1.5 text-[10px] ${subText}`}>combined</span> : null}
                  </td>
                  <td className={gridCell}>
                    <code className={`block break-all font-mono text-[11px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{ep.path}</code>
                    <div className={`mt-1 truncate font-mono text-[10px] ${subText}`} title={url}>
                      {url}
                    </div>
                  </td>
                  <td className={`${gridCell} whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => copy(url)}
                      className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium ${
                        isDarkMode
                          ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </td>
                  <td className={`${gridCell} whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => onRun(api, ep)}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                    >
                      <Play className="h-3.5 w-3.5" /> Run
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
