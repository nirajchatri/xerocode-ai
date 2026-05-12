import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from 'lucide-react';
import { PostmanStyleJsonViewer } from './PostmanStyleJsonViewer';
import {
  defaultExternalApiDraft,
  getExternalApiById,
  jsonParamRowsToBodyString,
  parseJsonObjectStringToParamRows,
  upsertExternalApi,
  type ExternalApiDefinition,
  type ExternalApiHttpMethod,
  type ExternalApiKeyValue,
} from '../lib/externalApis';
import { hasWorkspaceAuth, upsertExternalApiWorkspace } from '../lib/workspaceApis';

type RequestTab = 'params' | 'authorization' | 'headers' | 'body';

type Props = {
  isDarkMode: boolean;
  externalApiId: string | null;
  onBack: () => void;
  onSavedToList?: () => void;
};

const METHODS: ExternalApiHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const methodTone = (m: ExternalApiHttpMethod, dark: boolean): string => {
  const map: Record<ExternalApiHttpMethod, { light: string; dark: string }> = {
    GET: {
      light: 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold',
      dark: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 font-semibold',
    },
    POST: {
      light: 'border-amber-300 bg-amber-50 text-amber-900 font-semibold',
      dark: 'border-amber-500/40 bg-amber-500/15 text-amber-100 font-semibold',
    },
    PUT: {
      light: 'border-sky-300 bg-sky-50 text-sky-900 font-semibold',
      dark: 'border-sky-500/40 bg-sky-500/15 text-sky-100 font-semibold',
    },
    PATCH: {
      light: 'border-violet-300 bg-violet-50 text-violet-900 font-semibold',
      dark: 'border-violet-500/40 bg-violet-500/15 text-violet-100 font-semibold',
    },
    DELETE: {
      light: 'border-rose-300 bg-rose-50 text-rose-900 font-semibold',
      dark: 'border-rose-500/40 bg-rose-500/15 text-rose-100 font-semibold',
    },
  };
  return dark ? map[m].dark : map[m].light;
};

function buildUrlWithQuery(baseUrl: string, rows: ExternalApiKeyValue[]): string {
  const u = baseUrl.trim();
  if (!u) return '';
  try {
    const url = new URL(u.includes('://') ? u : `http://${u}`);
    rows.forEach((r) => {
      const k = r.key.trim();
      if (!k) return;
      url.searchParams.append(k, r.value);
    });
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    rows.forEach((r) => {
      const k = r.key.trim();
      if (!k) return;
      params.append(k, r.value);
    });
    const qs = params.toString();
    if (!qs) return u;
    return `${u}${u.includes('?') ? '&' : '?'}${qs}`;
  }
}

function headersToInit(rows: ExternalApiKeyValue[], auth: ExternalApiDefinition['authType'], bearer: string): Headers {
  const h = new Headers();
  rows.forEach((r) => {
    const k = r.key.trim();
    if (!k) return;
    h.set(k, r.value);
  });
  if (auth === 'bearer' && bearer.trim()) {
    h.set('Authorization', `Bearer ${bearer.trim()}`);
  }
  return h;
}

export const ExternalApiEditorScreen: React.FC<Props> = ({
  isDarkMode,
  externalApiId,
  onBack,
  onSavedToList,
}) => {
  const [definition, setDefinition] = useState<ExternalApiDefinition>(() => {
    const draft = defaultExternalApiDraft();
    return {
      ...draft,
      id: `ext-new-${Date.now()}`,
      savedAt: Date.now(),
    };
  });
  const [tab, setTab] = useState<RequestTab>('body');
  const [sending, setSending] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [resStatus, setResStatus] = useState<number | null>(null);
  const [resTimeMs, setResTimeMs] = useState<number | null>(null);
  const [resSize, setResSize] = useState<string | null>(null);
  const [resBody, setResBody] = useState('');
  const [resHeadersText, setResHeadersText] = useState('');
  const [resTab, setResTab] = useState<'body' | 'headers'>('body');
  const [resError, setResError] = useState<string | null>(null);

  useEffect(() => {
    if (externalApiId) {
      const found = getExternalApiById(externalApiId);
      if (found) setDefinition(found);
    } else {
      const draft = defaultExternalApiDraft();
      setDefinition({ ...draft, id: `ext-new-${Date.now()}`, savedAt: Date.now() });
    }
  }, [externalApiId]);

  const shellBg = isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#f5f5f5] text-slate-900';
  const cardBg = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';
  const tabInactive = isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800';
  const tabActive = isDarkMode ? 'border-orange-500 text-orange-300' : 'border-orange-500 text-orange-600';
  const inputCls = `h-9 rounded border px-2.5 text-[13px] outline-none ${
    isDarkMode
      ? 'border-slate-600 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-orange-500/60'
      : 'border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:border-orange-400'
  }`;
  const monoArea = `min-h-[160px] w-full resize-y rounded border p-3 font-mono text-[12px] leading-relaxed outline-none ${
    isDarkMode
      ? 'border-slate-700 bg-black/40 text-slate-200 focus:border-orange-500/50'
      : 'border-slate-300 bg-white text-slate-800 focus:border-orange-400'
  }`;

  const previewUrl = useMemo(() => buildUrlWithQuery(definition.url, definition.queryParams), [definition.url, definition.queryParams]);

  const updateKv = (
    field: 'queryParams' | 'headers' | 'bodyFormFields' | 'bodyJsonParams',
    idx: number,
    part: 'key' | 'value',
    value: string
  ) => {
    setDefinition((d) => {
      const rows = d[field].map((row, i) => (i === idx ? { ...row, [part]: value } : row));
      return { ...d, [field]: rows };
    });
  };

  const addKv = (field: 'queryParams' | 'headers' | 'bodyFormFields' | 'bodyJsonParams') => {
    setDefinition((d) => ({ ...d, [field]: [...d[field], { key: '', value: '' }] }));
  };

  const removeKv = (field: 'queryParams' | 'headers' | 'bodyFormFields' | 'bodyJsonParams', idx: number) => {
    setDefinition((d) => ({
      ...d,
      [field]: d[field].filter((_, i) => i !== idx).length ? d[field].filter((_, i) => i !== idx) : [{ key: '', value: '' }],
    }));
  };

  const saveToList = useCallback(() => {
    const id =
      definition.id.startsWith('ext-new-') ? `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : definition.id;
    const next = { ...definition, id, savedAt: Date.now() };
    upsertExternalApi(next);
    setDefinition(next);
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1500);
    if (hasWorkspaceAuth()) {
      void upsertExternalApiWorkspace(next).catch((err) => {
        window.alert(err instanceof Error ? err.message : 'Could not sync external API to server.');
      });
    }
    onSavedToList?.();
  }, [definition, onSavedToList]);

  const sendRequest = useCallback(async () => {
    const url = previewUrl.trim();
    if (!url) {
      window.alert('Enter a URL.');
      return;
    }
    setSending(true);
    setResError(null);
    setResStatus(null);
    setResTimeMs(null);
    setResSize(null);
    setResBody('');
    setResHeadersText('');
    const t0 = performance.now();
    try {
      const headers = headersToInit(definition.headers, definition.authType, definition.bearerToken);
      let body: string | undefined;
      if (definition.method === 'POST' || definition.method === 'PUT' || definition.method === 'PATCH') {
        if (definition.bodyKind === 'json') {
          if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
          body = definition.bodyRaw;
        } else if (definition.bodyKind === 'json-params') {
          if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
          body = jsonParamRowsToBodyString(definition.bodyJsonParams);
        } else if (definition.bodyKind === 'urlencoded') {
          const params = new URLSearchParams();
          definition.bodyFormFields.forEach((r) => {
            const k = r.key.trim();
            if (!k) return;
            params.append(k, r.value);
          });
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
          }
          body = params.toString();
        }
      }

      const res = await fetch(url, {
        method: definition.method,
        headers,
        body,
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - t0);
      const text = await res.text();
      let display = text;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        try {
          display = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          display = text;
        }
      }
      const headerLines: string[] = [];
      res.headers.forEach((v, k) => headerLines.push(`${k}: ${v}`));
      setResStatus(res.status);
      setResTimeMs(elapsed);
      setResSize(`${new Blob([text]).size} B`);
      setResBody(display || '(empty body)');
      setResHeadersText(headerLines.join('\n'));
    } catch (e) {
      setResError(e instanceof Error ? e.message : 'Request failed');
      setResTimeMs(Math.round(performance.now() - t0));
    } finally {
      setSending(false);
    }
  }, [definition, previewUrl]);

  const previewJsonBodyText = useMemo(() => {
    if (definition.bodyKind !== 'json-params') return '';
    return jsonParamRowsToBodyString(definition.bodyJsonParams);
  }, [definition.bodyKind, definition.bodyJsonParams]);

  const tabBtn = (id: RequestTab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={`relative shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        tab === id ? tabActive : `border-transparent ${tabInactive}`
      }`}
    >
      {label}
    </button>
  );

  const showsBodyTab = definition.method === 'POST' || definition.method === 'PUT' || definition.method === 'PATCH';

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${shellBg}`}>
      <header
        className={`flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5 ${isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'}`}
      >
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium ${
            isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className={`text-[12px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Name
          </span>
          <input
            type="text"
            value={definition.name}
            onChange={(e) => setDefinition((d) => ({ ...d, name: e.target.value }))}
            className={`${inputCls} min-w-0 flex-1`}
            placeholder="Request name"
          />
        </div>
        <button
          type="button"
          onClick={saveToList}
          className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white shadow-sm ${
            saveFlash ? 'bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          <Save className="h-4 w-4" />
          {saveFlash ? 'Saved' : 'Save to list'}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Request panel */}
        <div
          className={`flex min-h-[42vh] min-w-0 flex-1 flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}
        >
          <div className={`flex min-h-0 flex-1 flex-col space-y-3 p-4 ${isDarkMode ? 'bg-slate-900/80' : 'bg-white'}`}>
            <div className="flex flex-wrap items-stretch gap-2">
              <select
                value={definition.method}
                onChange={(e) =>
                  setDefinition((d) => ({ ...d, method: e.target.value as ExternalApiHttpMethod }))
                }
                className={`h-10 min-w-[100px] rounded border px-2 text-[13px] outline-none ${methodTone(definition.method, isDarkMode)} ${
                  isDarkMode ? 'bg-slate-950' : ''
                }`}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={definition.url}
                onChange={(e) => setDefinition((d) => ({ ...d, url: e.target.value }))}
                className={`${inputCls} min-w-0 flex-1 lg:min-w-[320px]`}
                placeholder="http://localhost:3000/api/icl-invoice/75"
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendRequest()}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#0969da] px-6 text-[13px] font-semibold text-white shadow-sm hover:bg-[#0860ca] disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>

            <div className={`flex shrink-0 flex-wrap gap-0 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              {tabBtn('params', 'Params')}
              {tabBtn('authorization', 'Authorization')}
              {tabBtn('headers', 'Headers')}
              {tabBtn('body', 'Body')}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'params' && (
                <div className="space-y-2">
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Query parameters appended to the URL when you Send.</p>
                  {definition.queryParams.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Key" value={row.key} onChange={(e) => updateKv('queryParams', i, 'key', e.target.value)} />
                      <input className={`${inputCls} flex-1`} placeholder="Value" value={row.value} onChange={(e) => updateKv('queryParams', i, 'value', e.target.value)} />
                      <button type="button" onClick={() => removeKv('queryParams', i)} className={`rounded p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addKv('queryParams')} className={`inline-flex items-center gap-1 text-[12px] font-medium text-orange-500 hover:underline`}>
                    <Plus className="h-3.5 w-3.5" /> Add param
                  </button>
                  {previewUrl !== definition.url.trim() && definition.url.trim() ? (
                    <p className={`break-all font-mono text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                      Preview: {previewUrl}
                    </p>
                  ) : null}
                </div>
              )}

              {tab === 'authorization' && (
                <div className="space-y-3">
                  <select
                    value={definition.authType}
                    onChange={(e) =>
                      setDefinition((d) => ({ ...d, authType: e.target.value === 'bearer' ? 'bearer' : 'none' }))
                    }
                    className={inputCls}
                  >
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                  </select>
                  {definition.authType === 'bearer' ? (
                    <input
                      type="password"
                      autoComplete="off"
                      value={definition.bearerToken}
                      onChange={(e) => setDefinition((d) => ({ ...d, bearerToken: e.target.value }))}
                      className={inputCls}
                      placeholder="Bearer token"
                    />
                  ) : null}
                </div>
              )}

              {tab === 'headers' && (
                <div className="space-y-2">
                  {definition.headers.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Header name" value={row.key} onChange={(e) => updateKv('headers', i, 'key', e.target.value)} />
                      <input className={`${inputCls} flex-1`} placeholder="Value" value={row.value} onChange={(e) => updateKv('headers', i, 'value', e.target.value)} />
                      <button type="button" onClick={() => removeKv('headers', i)} className={`rounded p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addKv('headers')} className={`inline-flex items-center gap-1 text-[12px] font-medium text-orange-500 hover:underline`}>
                    <Plus className="h-3.5 w-3.5" /> Add header
                  </button>
                </div>
              )}

              {tab === 'body' && (
                <div className="space-y-3">
                  {!showsBodyTab ? (
                    <p className={`text-[12px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Body is available for POST, PUT, and PATCH.</p>
                  ) : (
                    <>
                      <div className={`flex flex-wrap gap-x-5 gap-y-2 text-[13px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input type="radio" name="ext-body" checked={definition.bodyKind === 'none'} onChange={() => setDefinition((d) => ({ ...d, bodyKind: 'none' }))} />
                          none
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="ext-body"
                            checked={definition.bodyKind === 'json-params'}
                            onChange={() =>
                              setDefinition((d) => ({
                                ...d,
                                bodyKind: 'json-params',
                                bodyJsonParams: parseJsonObjectStringToParamRows(d.bodyRaw),
                              }))
                            }
                          />
                          JSON · parameters
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="ext-body"
                            checked={definition.bodyKind === 'json'}
                            onChange={() =>
                              setDefinition((d) => ({
                                ...d,
                                bodyKind: 'json',
                                bodyRaw:
                                  d.bodyKind === 'json-params'
                                    ? (() => {
                                        try {
                                          return JSON.stringify(JSON.parse(jsonParamRowsToBodyString(d.bodyJsonParams)), null, 2);
                                        } catch {
                                          return d.bodyRaw;
                                        }
                                      })()
                                    : d.bodyRaw,
                              }))
                            }
                          />
                          raw · JSON
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="ext-body"
                            checked={definition.bodyKind === 'urlencoded'}
                            onChange={() => setDefinition((d) => ({ ...d, bodyKind: 'urlencoded' }))}
                          />
                          x-www-form-urlencoded
                        </label>
                      </div>
                      {definition.bodyKind === 'json-params' ? (
                        <div className="space-y-2">
                          <p className={`text-[11px] leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Each row becomes a property on the JSON body. Values are sent as JSON when valid (e.g. <code className="font-mono">42</code>,{' '}
                            <code className="font-mono">true</code>, <code className="font-mono">{`{"a":1}`}</code>); otherwise as text strings.
                          </p>
                          {definition.bodyJsonParams.map((row, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                className={`${inputCls} flex-1 font-mono`}
                                placeholder="parameter name"
                                value={row.key}
                                onChange={(e) => updateKv('bodyJsonParams', i, 'key', e.target.value)}
                              />
                              <input
                                className={`${inputCls} flex-[2] font-mono`}
                                placeholder='value or JSON literal'
                                value={row.value}
                                onChange={(e) => updateKv('bodyJsonParams', i, 'value', e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => removeKv('bodyJsonParams', i)}
                                className={`rounded p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addKv('bodyJsonParams')}
                            className={`inline-flex items-center gap-1 text-[12px] font-medium text-orange-500 hover:underline`}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add parameter
                          </button>
                          {previewJsonBodyText ? (
                            <div className={`flex min-h-[180px] flex-col overflow-hidden rounded-md border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <p className={`shrink-0 border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${cardBg} ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                                Request JSON preview
                              </p>
                              <PostmanStyleJsonViewer
                                text={previewJsonBodyText}
                                isDarkMode={isDarkMode}
                                frameless
                                className="min-h-0 flex-1 rounded-none border-0"
                                emptyHint="{}"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {definition.bodyKind === 'json' ? (
                        <div className="flex min-h-[320px] flex-1 flex-col gap-2 lg:min-h-0">
                          <textarea
                            value={definition.bodyRaw}
                            onChange={(e) => setDefinition((d) => ({ ...d, bodyRaw: e.target.value }))}
                            className={`${monoArea} min-h-[120px] shrink-0`}
                            rows={6}
                            spellCheck={false}
                            placeholder="{}"
                          />
                          {definition.bodyRaw.trim() ? (
                            <div className={`flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-md border lg:min-h-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <p className={`shrink-0 border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${cardBg} ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                                Formatted preview
                              </p>
                              <PostmanStyleJsonViewer text={definition.bodyRaw} isDarkMode={isDarkMode} frameless className="min-h-0 flex-1 rounded-none border-0" />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {definition.bodyKind === 'urlencoded' ? (
                        <div className="space-y-2">
                          {definition.bodyFormFields.map((row, i) => (
                            <div key={i} className="flex gap-2">
                              <input className={`${inputCls} flex-1`} placeholder="field" value={row.key} onChange={(e) => updateKv('bodyFormFields', i, 'key', e.target.value)} />
                              <input className={`${inputCls} flex-1`} placeholder="value" value={row.value} onChange={(e) => updateKv('bodyFormFields', i, 'value', e.target.value)} />
                              <button type="button" onClick={() => removeKv('bodyFormFields', i)} className={`rounded p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addKv('bodyFormFields')} className={`inline-flex items-center gap-1 text-[12px] font-medium text-orange-500 hover:underline`}>
                            <Plus className="h-3.5 w-3.5" /> Add field
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Response panel */}
        <div className={`flex min-h-[42vh] min-w-0 flex-1 flex-col lg:min-h-0 ${isDarkMode ? 'bg-black/40' : 'bg-white'}`}>
          <div className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'}`}>
            <div className={`flex gap-1 border-b-2 border-transparent`}>
              <button type="button" onClick={() => setResTab('body')} className={`border-b-2 px-3 py-1.5 text-[13px] font-medium ${resTab === 'body' ? tabActive : tabInactive}`}>
                Body
              </button>
              <button type="button" onClick={() => setResTab('headers')} className={`border-b-2 px-3 py-1.5 text-[13px] font-medium ${resTab === 'headers' ? tabActive : tabInactive}`}>
                Headers
              </button>
            </div>
            <div className={`flex flex-wrap items-center gap-3 text-[12px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {resStatus !== null ? (
                <span
                  className={
                    resStatus >= 200 && resStatus < 300 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'
                  }
                >
                  {resStatus}
                  {resStatus === 200 ? ' OK' : resStatus === 204 ? ' No Content' : ''}
                </span>
              ) : (
                <span>—</span>
              )}
              {resTimeMs !== null ? <span>{resTimeMs} ms</span> : null}
              {resSize ? <span>{resSize}</span> : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {resError ? (
              <div className={`m-4 shrink-0 rounded-lg border px-3 py-2 text-[13px] ${isDarkMode ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{resError}</div>
            ) : resTab === 'headers' ? (
              <pre className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{resHeadersText || '—'}</pre>
            ) : resBody === 'Click Send to see the response.' || !resBody ? (
              <pre className={`p-4 font-mono text-[12px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Click Send to see the response.</pre>
            ) : (
              <PostmanStyleJsonViewer text={resBody} isDarkMode={isDarkMode} fillHeight className="rounded-none border-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExternalApiEditorScreen;
