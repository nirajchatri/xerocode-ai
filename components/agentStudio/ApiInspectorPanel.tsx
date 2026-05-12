import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Layers2, Loader2, Play, X } from 'lucide-react';

import { runAgentApiRequest } from './apiRequestRunner';
import type { AgentNodeData, ApiKeyValueRow, ApiVariableRow } from './agentNodeData';
import { HTTP_METHODS, normalizeApiData } from './agentNodeData';
import { CollapsibleJsonView } from './CollapsibleJsonView';

type ReqTab = 'headers' | 'query' | 'outputMsg';

const tabCls = (active: boolean, dark: boolean) =>
  `border-b-2 px-1.5 py-1 text-[9px] font-semibold transition-colors ${
    active
      ? 'border-blue-600 text-blue-600 dark:border-sky-400 dark:text-sky-300'
      : `border-transparent ${dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`
  }`;

export interface ApiInspectorPanelProps {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
  /** After a successful Test API run from the inspector (same as canvas Play for list sync). */
  onRunComplete?: (responseBodyJson: string, responseStatus: number | null) => void;
}

export const ApiInspectorPanel: React.FC<ApiInspectorPanelProps> = ({ data, isDarkMode, onPatch, onRunComplete }) => {
  const d = useMemo(() => normalizeApiData(data), [data]);
  const [reqTab, setReqTab] = useState<ReqTab>('headers');
  const [ioTab, setIoTab] = useState<'input' | 'output'>('output');
  const [running, setRunning] = useState(false);
  const [reqTabPanelOpen, setReqTabPanelOpen] = useState(true);

  const field = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const out = await runAgentApiRequest(d);
      onPatch({
        responseBodyJson: out.responseBodyJson,
        responseStatus: out.responseStatus,
      });
      onRunComplete?.(out.responseBodyJson, out.responseStatus);
      setIoTab('output');
    } finally {
      setRunning(false);
    }
  }, [d, onPatch, onRunComplete]);

  const setRows = (key: 'apiHeaders' | 'apiQueryParams', rows: ApiKeyValueRow[]) => onPatch({ [key]: rows });

  const patchRow = (key: 'apiHeaders' | 'apiQueryParams', index: number, field: 'key' | 'value', value: string) => {
    const cur = [...(key === 'apiHeaders' ? d.apiHeaders ?? [] : d.apiQueryParams ?? [])];
    if (!cur[index]) return;
    cur[index] = { ...cur[index], [field]: value };
    setRows(key, cur);
  };

  const addRow = (key: 'apiHeaders' | 'apiQueryParams') => {
    const cur = key === 'apiHeaders' ? d.apiHeaders ?? [] : d.apiQueryParams ?? [];
    setRows(key, [...cur, { key: '', value: '' }]);
  };

  const removeRow = (key: 'apiHeaders' | 'apiQueryParams', index: number) => {
    const cur = key === 'apiHeaders' ? [...(d.apiHeaders ?? [])] : [...(d.apiQueryParams ?? [])];
    cur.splice(index, 1);
    if (!cur.length) cur.push({ key: '', value: '' });
    setRows(key, cur);
  };

  const patchApiVar = (index: number, patch: Partial<ApiVariableRow>) => {
    const cur = [...(d.apiVariables ?? [])];
    if (!cur[index]) return;
    cur[index] = { ...cur[index], ...patch };
    onPatch({ apiVariables: cur });
  };

  const addApiVarRow = () => {
    const cur = d.apiVariables ?? [];
    onPatch({ apiVariables: [...cur, { name: '', valueType: 'string', value: '' }] });
  };

  const removeApiVarRow = (index: number) => {
    const cur = [...(d.apiVariables ?? [])];
    cur.splice(index, 1);
    if (!cur.length) cur.push({ name: '', valueType: 'string', value: '' });
    onPatch({ apiVariables: cur });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[4.5rem] flex-1">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Method</span>
          <select
            value={String(d.method || 'GET').toUpperCase()}
            onChange={(e) => onPatch({ method: e.target.value })}
            className={`w-full rounded-md border px-2 py-1.5 text-[11px] font-semibold ${field}`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-[2]">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">API name</span>
          <input
            value={String(d.apiName ?? '')}
            onChange={(e) => onPatch({ apiName: e.target.value })}
            className={`w-full rounded-md border px-2 py-1.5 text-xs font-semibold ${field}`}
            placeholder="My API"
          />
        </label>
      </div>

      <label className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
        <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide">Request URL</span>
        <div className="flex gap-1">
          <input
            type="text"
            value={String(d.url || '')}
            onChange={(e) => onPatch({ url: e.target.value })}
            className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px] ${field}`}
            placeholder="https://…"
          />
          {Boolean(d.url) && (
            <button
              type="button"
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              onClick={() => onPatch({ url: '' })}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
        <p className="min-w-0 flex-1 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
          Sends method, URL, headers, query string, and request body.
        </p>
        <button
          type="button"
          disabled={running}
          onClick={() => void run()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
          Test API
        </button>
      </div>

      <div className={`flex flex-wrap items-center gap-1 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          <button type="button" className={tabCls(reqTab === 'headers', isDarkMode)} onClick={() => setReqTab('headers')}>
            Headers
          </button>
          <button type="button" className={tabCls(reqTab === 'query', isDarkMode)} onClick={() => setReqTab('query')}>
            Query Params
          </button>
          <button type="button" className={tabCls(reqTab === 'outputMsg', isDarkMode)} onClick={() => setReqTab('outputMsg')}>
            Output Messages
          </button>
        </div>
        <button
          type="button"
          title={reqTabPanelOpen ? 'Collapse panels' : 'Expand panels'}
          className={`mb-px inline-flex shrink-0 rounded border px-1.5 py-1 text-[10px] ${
            isDarkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
          onClick={() => setReqTabPanelOpen((v) => !v)}
        >
          {reqTabPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {reqTabPanelOpen && reqTab === 'headers' && (
        <div className="space-y-1.5">
          {(d.apiHeaders ?? []).map((row, i) => (
            <div key={`ih-${i}`} className="flex gap-1">
              <input
                className={`w-1/2 rounded border px-1.5 py-1 text-[10px] ${field}`}
                placeholder="Key"
                value={row.key}
                onChange={(e) => patchRow('apiHeaders', i, 'key', e.target.value)}
              />
              <input
                className={`w-1/2 rounded border px-1.5 py-1 text-[10px] ${field}`}
                placeholder="Value"
                value={row.value}
                onChange={(e) => patchRow('apiHeaders', i, 'value', e.target.value)}
              />
              <button type="button" className="shrink-0 text-slate-400 hover:text-red-500" onClick={() => removeRow('apiHeaders', i)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-sky-400" onClick={() => addRow('apiHeaders')}>
            + Add Header
          </button>
        </div>
      )}

      {reqTabPanelOpen && reqTab === 'query' && (
        <div className="space-y-1.5">
          {(d.apiQueryParams ?? []).map((row, i) => (
            <div key={`iq-${i}`} className="flex gap-1">
              <input
                className={`w-1/2 rounded border px-1.5 py-1 text-[10px] ${field}`}
                placeholder="Key"
                value={row.key}
                onChange={(e) => patchRow('apiQueryParams', i, 'key', e.target.value)}
              />
              <input
                className={`w-1/2 rounded border px-1.5 py-1 text-[10px] ${field}`}
                placeholder="Value"
                value={row.value}
                onChange={(e) => patchRow('apiQueryParams', i, 'value', e.target.value)}
              />
              <button type="button" className="shrink-0 text-slate-400 hover:text-red-500" onClick={() => removeRow('apiQueryParams', i)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-sky-400" onClick={() => addRow('apiQueryParams')}>
            + Add param
          </button>
        </div>
      )}

      {reqTabPanelOpen && reqTab === 'outputMsg' && (
        <div className="space-y-2">
          <label className={`block ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Success message</span>
            <textarea
              value={String(d.successMessageText ?? '')}
              onChange={(e) => onPatch({ successMessageText: e.target.value })}
              rows={3}
              className={`w-full rounded-md border px-2 py-1.5 text-[10px] ${field}`}
              placeholder="When the HTTP call succeeds…"
            />
          </label>
          <label className={`block ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Error message</span>
            <textarea
              value={String(d.errorMessageText ?? '')}
              onChange={(e) => onPatch({ errorMessageText: e.target.value })}
              rows={3}
              className={`w-full rounded-md border px-2 py-1.5 text-[10px] ${field}`}
              placeholder="When the HTTP call fails…"
            />
          </label>
          <p className={`rounded-md border px-2 py-1.5 text-[9px] leading-snug ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
            Canvas node: oval handle on the left is <strong className="text-slate-600 dark:text-slate-400">Send</strong> (incoming); two ovals on
            the right are <strong className="text-slate-600 dark:text-slate-400">Success</strong> and <strong className="text-slate-600 dark:text-slate-400">Fail</strong> branches.
          </p>
        </div>
      )}

      <div className={`mt-3 border-t pt-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Variables</span>
          <button
            type="button"
            className={`inline-flex items-center gap-1 text-[10px] font-medium ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => addApiVarRow()}
          >
            <Layers2 className="h-3.5 w-3.5" />
            Add environment
          </button>
        </div>
        <div className="space-y-2">
          {(d.apiVariables ?? []).map((row, i) => (
            <div key={`iv-${i}`} className="flex flex-wrap gap-1">
              <input
                className={`min-w-[6rem] flex-1 rounded border px-1.5 py-1 text-[10px] ${field}`}
                placeholder="Input name"
                value={row.name}
                onChange={(e) => patchApiVar(i, { name: e.target.value })}
              />
              <div className="flex min-w-0 flex-[2] gap-px overflow-hidden rounded border border-opacity-80">
                <select
                  aria-label="Type"
                  value={row.valueType || 'string'}
                  onChange={(e) => patchApiVar(i, { valueType: e.target.value })}
                  className={`w-14 shrink-0 border-0 px-1 py-1 text-center text-[9px] ${field}`}
                >
                  <option value="string">Aa</option>
                  <option value="number">123</option>
                </select>
                <input
                  className={`min-w-0 flex-1 border-0 px-1.5 py-1 text-[10px] ${field}`}
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => patchApiVar(i, { value: e.target.value })}
                />
              </div>
              {(d.apiVariables ?? []).length > 1 && (
                <button type="button" className="shrink-0 text-slate-400 hover:text-red-500" onClick={() => removeApiVarRow(i)}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
        <div className="flex">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1.5 text-[10px] font-semibold ${
              ioTab === 'input' ? (isDarkMode ? 'bg-slate-900 shadow' : 'bg-white shadow') : 'text-slate-600 dark:text-slate-400'
            }`}
            onClick={() => setIoTab('input')}
          >
            Request body (JSON)
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1.5 text-[10px] font-semibold ${
              ioTab === 'output' ? (isDarkMode ? 'bg-slate-900 shadow' : 'bg-white shadow') : 'text-slate-600 dark:text-slate-400'
            }`}
            onClick={() => setIoTab('output')}
          >
            Response
          </button>
        </div>
      </div>

      {ioTab === 'input' && (
        <textarea
          value={String(d.requestBodyJson ?? '')}
          onChange={(e) => onPatch({ requestBodyJson: e.target.value })}
          rows={6}
          className={`w-full resize-y rounded-md border px-2 py-1.5 font-mono text-[10px] ${field}`}
          spellCheck={false}
        />
      )}

      {ioTab === 'output' && (
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
              {d.responseStatus != null ? (
                <>
                  Status <span className="text-emerald-600 dark:text-emerald-400">({d.responseStatus})</span>
                </>
              ) : (
                'Response'
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(String(d.responseBodyJson ?? ''))}
                className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <CollapsibleJsonView jsonText={String(d.responseBodyJson ?? '')} size="fit" />
        </div>
      )}
    </div>
  );
};
