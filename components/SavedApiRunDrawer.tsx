import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Shield,
  Terminal,
  X,
} from 'lucide-react';
import {
  expandSavedApiEndpoints,
  type SavedApi,
  type SavedEndpoint,
} from '../lib/savedApis';
import { apiUrl, getStudioAuthHeaders, persistPublicApiBearerJwt, readApiJson, readSavedPublicApiBearerJwt, studioFetch } from '../lib/apiBase';
import { fetchStoredPublicApiJwt, hasWorkspaceAuth } from '../lib/workspaceApis';
import { METHOD_TONE } from './SavedApiEndpointsGrid';

export type BodyFormRow = { key: string; value: string };

export type BodyEditorMode = 'json' | 'fields' | 'urlencoded';

export type SavedApiRunState = {
  api: SavedApi;
  endpoint: SavedEndpoint;
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  body: string;
  /** POST/PUT/PATCH: JSON textarea, JSON key/value fields, or url-encoded form body */
  bodyEditorMode: BodyEditorMode;
  bodyFormRows: BodyFormRow[];
  /** Same shape as bodyFormRows; values sent as plain strings (plus encoding). */
  bodyUrlEncodedRows: BodyFormRow[];
  bearerToken: string;
  publicBaseUrl: string;
  loading: boolean;
  status: number | null;
  responseText: string;
  responseHeaders: Record<string, string>;
  errorMessage: string | null;
  startedAt: number | null;
  durationMs: number | null;
};

function parseBodyToFormRows(body: string): BodyFormRow[] {
  try {
    const o = JSON.parse(body || '{}') as unknown;
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      const entries = Object.entries(o as Record<string, unknown>);
      if (entries.length === 0) return [{ key: '', value: '' }];
      return entries.map(([key, value]) => ({
        key,
        value:
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      }));
    }
  } catch {
    /* fall through */
  }
  return [{ key: '', value: '' }];
}

function urlRowsToJsonString(rows: BodyFormRow[]): string {
  const obj: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    obj[k] = r.value;
  }
  return JSON.stringify(obj, null, 2);
}

function parseBodyToUrlEncodedRows(body: string): BodyFormRow[] {
  const trimmed = (body || '').trim();
  if (!trimmed) return [{ key: '', value: '' }];
  try {
    const o = JSON.parse(trimmed) as unknown;
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      const entries = Object.entries(o as Record<string, unknown>);
      if (entries.length === 0) return [{ key: '', value: '' }];
      return entries.map(([key, value]) => ({
        key,
        value:
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      }));
    }
  } catch {
    /* fall through */
  }
  const qp = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  if (/[&=]/.test(qp)) {
    const params = new URLSearchParams(qp);
    const rows: BodyFormRow[] = [];
    params.forEach((value, key) => rows.push({ key, value }));
    if (rows.length > 0) return rows;
  }
  return [{ key: '', value: '' }];
}

function urlEncodedRowsToString(rows: BodyFormRow[]): string {
  const params = new URLSearchParams();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    params.append(k, r.value);
  }
  return params.toString();
}

function syncBodySlices(jsonBody: string): Pick<SavedApiRunState, 'body' | 'bodyFormRows' | 'bodyUrlEncodedRows'> {
  return {
    body: jsonBody,
    bodyFormRows: parseBodyToFormRows(jsonBody),
    bodyUrlEncodedRows: parseBodyToUrlEncodedRows(jsonBody),
  };
}

function formRowsToJson(rows: BodyFormRow[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    const v = r.value.trim();
    if (v === '') {
      obj[k] = '';
      continue;
    }
    try {
      obj[k] = JSON.parse(v) as unknown;
    } catch {
      obj[k] = v;
    }
  }
  return JSON.stringify(obj, null, 2);
}

/** Canonical JSON body string from whichever editor mode is active. */
function canonicalJsonBodyString(rs: SavedApiRunState): string {
  if (rs.bodyEditorMode === 'json') return rs.body;
  if (rs.bodyEditorMode === 'fields') return formRowsToJson(rs.bodyFormRows);
  return urlRowsToJsonString(rs.bodyUrlEncodedRows);
}

function applyBodySwitch(rs: SavedApiRunState, nextMode: BodyEditorMode): SavedApiRunState {
  const jsonBody = canonicalJsonBodyString(rs);
  return {
    ...rs,
    bodyEditorMode: nextMode,
    ...syncBodySlices(jsonBody),
  };
}

export function createSavedApiRunState(api: SavedApi, endpoint: SavedEndpoint): SavedApiRunState {
  const pathValues: Record<string, string> = {};
  endpoint.pathParams.forEach((p) => {
    pathValues[p] = '';
  });
  const queryValues: Record<string, string> = {};
  endpoint.queryParams.forEach((q) => {
    queryValues[q] = '';
  });
  const body =
    endpoint.method === 'POST' || endpoint.method === 'PUT' || endpoint.method === 'PATCH'
      ? endpoint.payloadSample
      : '';
  return {
    api,
    endpoint,
    pathValues,
    queryValues,
    bodyEditorMode: 'json',
    ...syncBodySlices(body),
    bearerToken: readSavedPublicApiBearerJwt(),
    publicBaseUrl: api.publicBaseUrl || 'https://api.example.com',
    loading: false,
    status: null,
    responseText: '',
    responseHeaders: {},
    errorMessage: null,
    startedAt: null,
    durationMs: null,
  };
}

const sampleValueForType = (type: string | undefined): string => {
  const t = (type || '').toLowerCase();
  if (t.includes('int') || t.includes('decimal') || t.includes('numeric') || t.includes('float') || t.includes('double'))
    return '0';
  if (t.includes('bool') || t.includes('bit')) return 'false';
  if (t.includes('date') || t.includes('time')) return '2024-01-01';
  return '';
};

type Props = {
  isDarkMode: boolean;
  runState: SavedApiRunState | null;
  setRunState: React.Dispatch<React.SetStateAction<SavedApiRunState | null>>;
};

export const SavedApiRunDrawer: React.FC<Props> = ({ isDarkMode, runState, setRunState }) => {
  const [issuingRunBearerToken, setIssuingRunBearerToken] = useState(false);

  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const innerCardBg = isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50';
  const inputClasses = `h-9 w-full rounded-md border px-3 text-xs outline-none ${
    isDarkMode
      ? 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:border-violet-500'
      : 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-violet-400'
  }`;
  const codeBlock = isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-900 text-slate-100';

  const openRun = useCallback(
    (api: SavedApi, ep: SavedEndpoint) => {
      setRunState(createSavedApiRunState(api, ep));
    },
    [setRunState]
  );

  const closeRun = useCallback(() => setRunState(null), [setRunState]);

  const bodyIsJsonObject = useMemo(() => {
    if (!runState?.body?.trim()) return true;
    try {
      const o = JSON.parse(runState.body) as unknown;
      return o !== null && typeof o === 'object' && !Array.isArray(o);
    } catch {
      return false;
    }
  }, [runState?.body]);

  const computeRunUrl = useCallback((rs: SavedApiRunState): string => {
    let p = rs.endpoint.path;
    rs.endpoint.pathParams.forEach((param) => {
      const v = rs.pathValues[param] || `:${param}`;
      p = p.replace(`:${param}`, encodeURIComponent(v));
    });
    const params = new URLSearchParams();
    rs.endpoint.queryParams.forEach((qp) => {
      const v = rs.queryValues[qp];
      if (v && v.length > 0) params.append(qp, v);
    });
    const qs = params.toString();
    const base = (rs.publicBaseUrl || '').trim().replace(/\/+$/, '') || 'https://api.example.com';
    const path = p.startsWith('/') ? p : `/${p}`;
    return qs ? `${base}${path}?${qs}` : `${base}${path}`;
  }, []);

  const issueJwtForRun = useCallback(async () => {
    if (!runState) return;
    const headers = getStudioAuthHeaders();
    if (!headers['x-user-email']) {
      window.alert('Sign in so the server can issue a Bearer JWT for this saved datasource.');
      return;
    }
    const cid = runState.api.connection?.id;
    if (!cid || !Number.isFinite(Number(cid))) {
      window.alert('This saved API has no valid connection id.');
      return;
    }
    setIssuingRunBearerToken(true);
    try {
      const res = await studioFetch(apiUrl('/api/public-api-token/issue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ connectionId: cid, expiresInHours: 24 }),
      });
      const data = await readApiJson<{ ok?: boolean; token?: string; message?: string }>(res);
      if (!res.ok || !data?.ok || !data.token) {
        throw new Error(data?.message || `Unable to issue token (HTTP ${res.status}).`);
      }
      setRunState((prev) => (prev ? { ...prev, bearerToken: data.token as string } : prev));
      persistPublicApiBearerJwt(data.token as string);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not issue token.');
    } finally {
      setIssuingRunBearerToken(false);
    }
  }, [runState, setRunState]);

  /** Load JWT previously issued for this datasource from control DB (when signed in and field empty). */
  useEffect(() => {
    if (!runState) return undefined;
    const cid = runState.api.connection?.id;
    const apiId = runState.api.id;
    if (!cid || !hasWorkspaceAuth()) return undefined;
    let cancelled = false;
    void fetchStoredPublicApiJwt(cid)
      .then(({ token }) => {
        if (cancelled || !token) return;
        setRunState((prev) => {
          if (!prev || prev.api.id !== apiId) return prev;
          if (prev.bearerToken.trim()) return prev;
          persistPublicApiBearerJwt(token);
          return { ...prev, bearerToken: token };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runState?.api.id, runState?.api.connection?.id, setRunState]);

  const executeRun = useCallback(async () => {
    if (!runState) return;
    setRunState((rs) =>
      rs ? { ...rs, loading: true, errorMessage: null, status: null, responseText: '', responseHeaders: {}, startedAt: Date.now() } : rs
    );
    const url = computeRunUrl(runState);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...getStudioAuthHeaders(),
    };
    if (runState.bearerToken.trim()) headers.Authorization = `Bearer ${runState.bearerToken.trim()}`;
    let bodyToSend: string | undefined;
    if (
      runState.endpoint.method === 'POST' ||
      runState.endpoint.method === 'PUT' ||
      runState.endpoint.method === 'PATCH'
    ) {
      if (runState.bodyEditorMode === 'urlencoded') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        bodyToSend = urlEncodedRowsToString(runState.bodyUrlEncodedRows);
      } else {
        headers['Content-Type'] = 'application/json';
        bodyToSend =
          runState.bodyEditorMode === 'fields' ? formRowsToJson(runState.bodyFormRows) : runState.body;
      }
    }
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: runState.endpoint.method,
        headers,
        body: bodyToSend,
        mode: 'cors',
      });
      const ct = res.headers.get('content-type') || '';
      const text = await res.text();
      const headerMap: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerMap[k] = v;
      });
      let pretty = text;
      if (ct.includes('json')) {
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          pretty = text;
        }
      }
      setRunState((rs) =>
        rs
          ? {
              ...rs,
              loading: false,
              status: res.status,
              responseText: pretty,
              responseHeaders: headerMap,
              durationMs: Date.now() - start,
              errorMessage: null,
            }
          : rs
      );
    } catch (e) {
      setRunState((rs) =>
        rs
          ? {
              ...rs,
              loading: false,
              status: null,
              responseText: '',
              responseHeaders: {},
              durationMs: Date.now() - start,
              errorMessage: e instanceof Error ? e.message : 'Request failed (likely network or CORS).',
            }
          : rs
      );
    }
  }, [runState, computeRunUrl, setRunState]);

  const copyToClipboard = (s: string) => {
    try {
      void navigator.clipboard.writeText(s);
    } catch {
      /* ignore */
    }
  };

  const buildCurl = (rs: SavedApiRunState): string => {
    const url = computeRunUrl(rs);
    const lines: string[] = [`curl -X ${rs.endpoint.method} "${url}"`];
    const session = getStudioAuthHeaders();
    if (session['x-user-email']) {
      lines.push(`  -H "x-user-email: ${session['x-user-email']}"`);
      lines.push(`  -H "x-user-name: ${(session['x-user-name'] || session['x-user-email']).replace(/"/g, '\\"')}"`);
    }
    if (rs.bearerToken.trim()) lines.push(`  -H "Authorization: Bearer ${rs.bearerToken.trim()}"`);
    if (rs.endpoint.method === 'POST' || rs.endpoint.method === 'PUT' || rs.endpoint.method === 'PATCH') {
      if (rs.bodyEditorMode === 'urlencoded') {
        lines.push('  -H "Content-Type: application/x-www-form-urlencoded;charset=UTF-8"');
        lines.push(`  --data-raw '${urlEncodedRowsToString(rs.bodyUrlEncodedRows).replace(/'/g, "'\\''")}'`);
      } else {
        const payload = rs.bodyEditorMode === 'fields' ? formRowsToJson(rs.bodyFormRows) : rs.body;
        lines.push('  -H "Content-Type: application/json"');
        lines.push(`  -d '${(payload || '{}').replace(/'/g, "'\\''")}'`);
      }
    }
    return lines.join(' \\\n');
  };

  if (!runState) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 backdrop-blur-sm">
      <div className={`flex h-full w-full max-w-2xl flex-col border-l shadow-2xl ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
        <div className={`flex items-center justify-between border-b px-4 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Terminal className={`h-4 w-4 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}`} />
            <div>
              <h2 className={`text-sm font-semibold ${heading}`}>Run · {runState.api.name}</h2>
              <p className={`text-[11px] ${subText}`}>
                {runState.endpoint.combined ? 'Combined endpoint' : `Table: ${runState.endpoint.scope}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeRun}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
              isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {expandSavedApiEndpoints(runState.api).length > 1 && (
            <div>
              <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Endpoint</label>
              <select
                className={inputClasses}
                value={`${runState.endpoint.method}|${runState.endpoint.path}|${runState.endpoint.scope}`}
                onChange={(e) => {
                  const [m, p, scope] = e.target.value.split('|');
                  const next = expandSavedApiEndpoints(runState.api).find(
                    (ep) => ep.method === m && ep.path === p && ep.scope === scope
                  );
                  if (next) openRun(runState.api, next);
                }}
              >
                {expandSavedApiEndpoints(runState.api).map((ep) => (
                  <option key={`${ep.scope}|${ep.method}|${ep.path}`} value={`${ep.method}|${ep.path}|${ep.scope}`}>
                    {ep.method} {ep.path} ({ep.scope})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={`rounded-lg border px-3 py-2 ${innerCardBg}`}>
            <div className={`flex flex-wrap items-center gap-2 text-[11px] ${subText}`}>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                  isDarkMode ? METHOD_TONE[runState.endpoint.method].dark : METHOD_TONE[runState.endpoint.method].light
                }`}
              >
                {runState.endpoint.method}
              </span>
              <Globe className="h-3 w-3" />
              <code className={`break-all ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{computeRunUrl(runState)}</code>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${subText}`}>
                <Globe className="mr-1 inline h-3 w-3" /> Public base URL
              </label>
              <input
                type="text"
                value={runState.publicBaseUrl}
                onChange={(e) => setRunState((rs) => (rs ? { ...rs, publicBaseUrl: e.target.value } : rs))}
                placeholder="https://api.example.com"
                className={inputClasses}
              />
            </div>
            <div>
              <label className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${subText}`}>
                <KeyRound className="mr-1 inline h-3 w-3" /> Bearer token
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={runState.bearerToken}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRunState((rs) => (rs ? { ...rs, bearerToken: v } : rs));
                    persistPublicApiBearerJwt(v);
                  }}
                  placeholder="Paste JWT or Issue… (saved in this browser)"
                  className={`${inputClasses} min-w-[140px] flex-1`}
                />
                <button
                  type="button"
                  disabled={issuingRunBearerToken}
                  onClick={() => void issueJwtForRun()}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold ${
                    isDarkMode
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25 disabled:opacity-50'
                      : 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50'
                  }`}
                >
                  {issuingRunBearerToken ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  Issue JWT
                </button>
              </div>
              <p className={`mt-1 text-[10px] ${subText}`}>
                JWT is scoped to your workspace and this datasource profile (no DB password inside).
              </p>
            </div>
          </div>

          {runState.endpoint.pathParams.length > 0 && (
            <div>
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Path parameters</p>
              <div className="space-y-1.5">
                {runState.endpoint.pathParams.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className={`w-32 shrink-0 truncate text-[11px] ${heading}`}>:{p}</span>
                    <input
                      type="text"
                      value={runState.pathValues[p] || ''}
                      onChange={(e) =>
                        setRunState((rs) =>
                          rs ? { ...rs, pathValues: { ...rs.pathValues, [p]: e.target.value } } : rs
                        )
                      }
                      placeholder={sampleValueForType('') || 'value'}
                      className={inputClasses}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {runState.endpoint.queryParams.length > 0 && (
            <div>
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Query parameters</p>
              <div className="space-y-1.5">
                {runState.endpoint.queryParams.map((q) => (
                  <div key={q} className="flex items-center gap-2">
                    <span className={`w-32 shrink-0 truncate text-[11px] ${heading}`}>{q}</span>
                    <input
                      type="text"
                      value={runState.queryValues[q] || ''}
                      onChange={(e) =>
                        setRunState((rs) =>
                          rs ? { ...rs, queryValues: { ...rs.queryValues, [q]: e.target.value } } : rs
                        )
                      }
                      placeholder="(optional)"
                      className={inputClasses}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(runState.endpoint.method === 'POST' ||
            runState.endpoint.method === 'PUT' ||
            runState.endpoint.method === 'PATCH') && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Request body</p>
                <div
                  className={`flex flex-wrap gap-1 rounded-lg border p-0.5 text-[10px] sm:text-[11px] ${
                    isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-100'
                  }`}
                  role="tablist"
                  aria-label="Body editor mode"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={runState.bodyEditorMode === 'json'}
                    onClick={() =>
                      setRunState((rs) => (rs && rs.bodyEditorMode !== 'json' ? applyBodySwitch(rs, 'json') : rs))
                    }
                    className={`rounded-md px-2 py-1 font-semibold sm:px-2.5 ${
                      runState.bodyEditorMode === 'json'
                        ? isDarkMode
                          ? 'bg-slate-800 text-slate-100 shadow-sm'
                          : 'bg-white text-slate-900 shadow-sm'
                        : isDarkMode
                          ? 'text-slate-400 hover:text-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={runState.bodyEditorMode === 'fields'}
                    onClick={() =>
                      setRunState((rs) => (rs && rs.bodyEditorMode !== 'fields' ? applyBodySwitch(rs, 'fields') : rs))
                    }
                    className={`rounded-md px-2 py-1 font-semibold sm:px-2.5 ${
                      runState.bodyEditorMode === 'fields'
                        ? isDarkMode
                          ? 'bg-slate-800 text-slate-100 shadow-sm'
                          : 'bg-white text-slate-900 shadow-sm'
                        : isDarkMode
                          ? 'text-slate-400 hover:text-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Edit top-level JSON object as key/value fields"
                  >
                    Fields
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={runState.bodyEditorMode === 'urlencoded'}
                    onClick={() =>
                      setRunState((rs) =>
                        rs && rs.bodyEditorMode !== 'urlencoded' ? applyBodySwitch(rs, 'urlencoded') : rs
                      )
                    }
                    className={`rounded-md px-2 py-1 font-semibold sm:px-2.5 ${
                      runState.bodyEditorMode === 'urlencoded'
                        ? isDarkMode
                          ? 'bg-slate-800 text-slate-100 shadow-sm'
                          : 'bg-white text-slate-900 shadow-sm'
                        : isDarkMode
                          ? 'text-slate-400 hover:text-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="application/x-www-form-urlencoded"
                  >
                    Form URL
                  </button>
                </div>
              </div>
              {runState.bodyEditorMode === 'json' && (
                <textarea
                  value={runState.body}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRunState((rs) => (rs ? { ...rs, ...syncBodySlices(v) } : rs));
                  }}
                  rows={8}
                  spellCheck={false}
                  placeholder='{"field": "value"}'
                  className={`w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:border-emerald-500'
                      : 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-emerald-400'
                  }`}
                />
              )}
              {runState.bodyEditorMode === 'fields' && (
                <div className="space-y-2">
                  {!bodyIsJsonObject && (
                    <p
                      className={`rounded-md border px-2 py-1.5 text-[10px] leading-snug ${
                        isDarkMode ? 'border-amber-500/35 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      Body isn&apos;t a JSON object (or is invalid JSON). Use the <strong>JSON</strong> tab to fix it, or edits here may replace the payload with an object built from the fields below.
                    </p>
                  )}
                  <p className={`text-[10px] leading-snug ${subText}`}>
                    Top-level JSON object fields only. Use JSON tab for arrays or nested-only payloads. Numbers and booleans can be typed as{' '}
                    <code className="font-mono">42</code>, <code className="font-mono">true</code>, etc.
                  </p>
                  {runState.bodyFormRows.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => {
                          const key = e.target.value;
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyFormRows = rs.bodyFormRows.map((r, j) => (j === i ? { ...r, key } : r));
                            const jsonBody = formRowsToJson(bodyFormRows);
                            return { ...rs, bodyFormRows, ...syncBodySlices(jsonBody) };
                          });
                        }}
                        placeholder="field name"
                        className={`${inputClasses} min-w-[120px] flex-1 font-mono`}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyFormRows = rs.bodyFormRows.map((r, j) => (j === i ? { ...r, value } : r));
                            const jsonBody = formRowsToJson(bodyFormRows);
                            return { ...rs, bodyFormRows, ...syncBodySlices(jsonBody) };
                          });
                        }}
                        placeholder='value or JSON literal'
                        className={`${inputClasses} min-w-[160px] flex-[2] font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyFormRows = rs.bodyFormRows.filter((_, j) => j !== i);
                            const nextRows = bodyFormRows.length > 0 ? bodyFormRows : [{ key: '', value: '' }];
                            const jsonBody = formRowsToJson(nextRows);
                            return { ...rs, bodyFormRows: nextRows, ...syncBodySlices(jsonBody) };
                          })
                        }
                        className={`inline-flex h-9 shrink-0 items-center rounded-md border px-2 text-[11px] ${
                          isDarkMode
                            ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setRunState((rs) => {
                        if (!rs) return rs;
                        const bodyFormRows = [...rs.bodyFormRows, { key: '', value: '' }];
                        const jsonBody = formRowsToJson(bodyFormRows);
                        return { ...rs, bodyFormRows, ...syncBodySlices(jsonBody) };
                      })
                    }
                    className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-medium ${
                      isDarkMode
                        ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Add field
                  </button>
                </div>
              )}
              {runState.bodyEditorMode === 'urlencoded' && (
                <div className="space-y-2">
                  <p className={`text-[10px] leading-snug ${subText}`}>
                    Sends <code className="font-mono text-[10px]">application/x-www-form-urlencoded</code>. Values are plain text (encoded automatically). Switch to JSON for nested structures.
                  </p>
                  {runState.bodyUrlEncodedRows.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => {
                          const key = e.target.value;
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyUrlEncodedRows = rs.bodyUrlEncodedRows.map((r, j) => (j === i ? { ...r, key } : r));
                            const jsonBody = urlRowsToJsonString(bodyUrlEncodedRows);
                            return { ...rs, bodyUrlEncodedRows, ...syncBodySlices(jsonBody) };
                          });
                        }}
                        placeholder="field name"
                        className={`${inputClasses} min-w-[120px] flex-1 font-mono`}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyUrlEncodedRows = rs.bodyUrlEncodedRows.map((r, j) => (j === i ? { ...r, value } : r));
                            const jsonBody = urlRowsToJsonString(bodyUrlEncodedRows);
                            return { ...rs, bodyUrlEncodedRows, ...syncBodySlices(jsonBody) };
                          });
                        }}
                        placeholder="value"
                        className={`${inputClasses} min-w-[160px] flex-[2] font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRunState((rs) => {
                            if (!rs) return rs;
                            const bodyUrlEncodedRows = rs.bodyUrlEncodedRows.filter((_, j) => j !== i);
                            const nextRows = bodyUrlEncodedRows.length > 0 ? bodyUrlEncodedRows : [{ key: '', value: '' }];
                            const jsonBody = urlRowsToJsonString(nextRows);
                            return { ...rs, bodyUrlEncodedRows: nextRows, ...syncBodySlices(jsonBody) };
                          })
                        }
                        className={`inline-flex h-9 shrink-0 items-center rounded-md border px-2 text-[11px] ${
                          isDarkMode
                            ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setRunState((rs) => {
                        if (!rs) return rs;
                        const bodyUrlEncodedRows = [...rs.bodyUrlEncodedRows, { key: '', value: '' }];
                        const jsonBody = urlRowsToJsonString(bodyUrlEncodedRows);
                        return { ...rs, bodyUrlEncodedRows, ...syncBodySlices(jsonBody) };
                      })
                    }
                    className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-medium ${
                      isDarkMode
                        ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Add field
                  </button>
                  <div className={`rounded-md border px-2 py-1.5 ${innerCardBg}`}>
                    <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${subText}`}>Encoded preview</p>
                    <code className={`block break-all font-mono text-[10px] ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      {urlEncodedRowsToString(runState.bodyUrlEncodedRows) || '(empty)'}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className={`mb-2 text-[10px] leading-snug ${subText}`}>
            While signed in, <strong>Send request</strong> adds your workspace headers (<code className="font-mono text-[10px]">x-user-email</code>)
            together with the Bearer token. Bearer-only clients may use datasource routes under{' '}
            <code className="font-mono text-[10px]">/api/connections/&lt;id&gt;/…</code>.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={executeRun}
              disabled={runState.loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Send request
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(buildCurl(runState))}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs ${
                isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Copy className="h-3.5 w-3.5" /> Copy cURL
            </button>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Response</p>
              {runState.status !== null && (
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                    runState.status >= 200 && runState.status < 300
                      ? isDarkMode
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : isDarkMode
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                        : 'border-rose-300 bg-rose-50 text-rose-700'
                  }`}
                >
                  {runState.status}
                </span>
              )}
              {runState.durationMs !== null && (
                <span className={`text-[10px] ${subText}`}>{runState.durationMs} ms</span>
              )}
            </div>
            {runState.errorMessage ? (
              <div
                className={`rounded-lg border px-3 py-2 text-[11px] ${isDarkMode ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
              >
                {runState.errorMessage}
                <p className="mt-1 text-[10px] opacity-80">
                  Tip: try copying the cURL command if CORS blocks the browser request.
                </p>
              </div>
            ) : (
              <pre className={`max-h-[260px] overflow-auto rounded-lg p-3 text-[11px] ${codeBlock}`}>
                {runState.responseText || '(no response yet — click "Send request")'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
