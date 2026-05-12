import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  NodeToolbar,
  Handle,
  Position,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  Copy,
  Info,
  Loader2,
  Palette,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

import type { AgentNodeData, ApiAccent, ApiKeyValueRow } from '../agentNodeData';
import { API_ACCENTS, HTTP_METHODS, normalizeApiData } from '../agentNodeData';
import { CollapsibleJsonView } from '../CollapsibleJsonView';
import { runAgentApiRequest } from '../apiRequestRunner';
import { applyApiSuccessToConnectedListNodes } from '../apiListPropagation';
import { useAgentStudioActions } from '../AgentStudioActionsContext';

/** Preset endpoints — surfaced via search-as-you-type on the Request URL field. */
const API_URL_PRESETS: { id: string; label: string; patch: Partial<AgentNodeData> }[] = [
  {
    id: 'sales',
    label: 'Sales API (xerocode)',
    patch: {
      apiName: 'Sales API',
      method: 'GET',
      url: 'https://api.xerocode.ai/v1/sales',
    },
  },
  {
    id: 'users',
    label: 'Users directory',
    patch: {
      apiName: 'Users',
      method: 'GET',
      url: 'https://api.xerocode.ai/v1/users',
    },
  },
];

type ReqTab = 'headers' | 'query' | 'outputMsg';

const ovalHandleClass =
  '!z-[35] !h-[22px] !w-[10px] !min-h-[22px] !min-w-[10px] !rounded-full !border-2 !border-white !bg-slate-600 dark:!bg-slate-500';

export function ApiWorkflowNode({ id, data, selected }: NodeProps) {
  const { setNodes, setEdges, getNode, getEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const studio = useAgentStudioActions();
  const d0 = useMemo(() => normalizeApiData((data || {}) as AgentNodeData), [data]);
  const accent = (d0.apiAccent ?? 'sky') as ApiAccent;
  const theme = API_ACCENTS[accent] ?? API_ACCENTS.sky;

  const [reqExpanded, setReqExpanded] = useState(true);
  const [reqTab, setReqTab] = useState<ReqTab>('headers');
  const [ioTab, setIoTab] = useState<'input' | 'output'>('output');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [nodeMenuHover, setNodeMenuHover] = useState(false);
  const [urlSuggestOpen, setUrlSuggestOpen] = useState(false);
  const [reqTabPanelOpen, setReqTabPanelOpen] = useState(true);
  const [handlePos, setHandlePos] = useState<{ inY: number; successY: number; failY: number }>({
    inY: 24,
    successY: 20,
    failY: 32,
  });
  const [layoutTick, setLayoutTick] = useState(0);
  const nodeRef = useRef<HTMLDivElement>(null);
  const collapsedBarRef = useRef<HTMLDivElement>(null);
  const sendStripRef = useRef<HTMLDivElement>(null);
  const sendLaneRef = useRef<HTMLDivElement>(null);
  const successLineRef = useRef<HTMLDivElement>(null);
  const failLineRef = useRef<HTMLDivElement>(null);
  const menuLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlSuggestCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMenuLeaveTimer = useCallback(() => {
    if (menuLeaveTimer.current) {
      clearTimeout(menuLeaveTimer.current);
      menuLeaveTimer.current = null;
    }
  }, []);

  const onNodeMenuEnter = useCallback(() => {
    clearMenuLeaveTimer();
    setNodeMenuHover(true);
  }, [clearMenuLeaveTimer]);

  const onNodeMenuLeave = useCallback(() => {
    clearMenuLeaveTimer();
    menuLeaveTimer.current = setTimeout(() => setNodeMenuHover(false), 200);
  }, [clearMenuLeaveTimer]);

  useEffect(() => () => clearMenuLeaveTimer(), [clearMenuLeaveTimer]);

  const clearUrlSuggestTimer = useCallback(() => {
    if (urlSuggestCloseTimer.current) {
      clearTimeout(urlSuggestCloseTimer.current);
      urlSuggestCloseTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearUrlSuggestTimer(), [clearUrlSuggestTimer]);

  useEffect(() => {
    const root = nodeRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLayoutTick((k) => k + 1));
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const updateData = useCallback(
    (patch: Partial<AgentNodeData>) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const prev = (node.data || {}) as AgentNodeData;
          return { ...node, data: normalizeApiData({ ...prev, ...patch }) };
        })
      );
    },
    [id, setNodes]
  );

  const urlQuery = (d0.url ?? '').trim().toLowerCase();
  const urlPresetMatches = useMemo(() => {
    if (!urlQuery) return API_URL_PRESETS;
    return API_URL_PRESETS.filter(
      (p) =>
        p.label.toLowerCase().includes(urlQuery) ||
        (p.patch.url && p.patch.url.toLowerCase().includes(urlQuery)) ||
        (p.patch.apiName && String(p.patch.apiName).toLowerCase().includes(urlQuery))
    );
  }, [d0.url]);

  const applyUrlPreset = useCallback(
    (preset: (typeof API_URL_PRESETS)[number]) => {
      updateData(preset.patch);
      setUrlSuggestOpen(false);
    },
    [updateData]
  );

  const onUrlFieldFocus = useCallback(() => {
    clearUrlSuggestTimer();
    setUrlSuggestOpen(true);
  }, [clearUrlSuggestTimer]);

  const onUrlFieldBlur = useCallback(() => {
    clearUrlSuggestTimer();
    urlSuggestCloseTimer.current = setTimeout(() => setUrlSuggestOpen(false), 180);
  }, [clearUrlSuggestTimer]);

  const onDelete = useCallback(() => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, setEdges, setNodes]);

  const onDuplicate = useCallback(() => {
    const me = getNode(id);
    if (!me) return;
    const newId = `api-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        ...me,
        id: newId,
        position: { x: me.position.x + 48, y: me.position.y + 48 },
        selected: false,
        data: { ...(me.data as AgentNodeData), nid: newId },
      },
    ]);
  }, [id, getNode, setNodes]);

  const runRequest = useCallback(async () => {
    setRunning(true);
    try {
      const out = await runAgentApiRequest(d0);
      updateData({ responseBodyJson: out.responseBodyJson, responseStatus: out.responseStatus });
      applyApiSuccessToConnectedListNodes({
        apiNodeId: id,
        responseBodyJson: out.responseBodyJson,
        responseStatus: out.responseStatus,
        getEdges,
        setNodes,
      });
      setIoTab('output');
    } finally {
      setRunning(false);
    }
  }, [d0, updateData, id, getEdges, setNodes]);

  const copyOutput = useCallback(() => {
    void navigator.clipboard?.writeText(String(d0.responseBodyJson ?? ''));
  }, [d0.responseBodyJson]);

  const setRows = (key: 'apiHeaders' | 'apiQueryParams', rows: ApiKeyValueRow[]) => {
    updateData({ [key]: rows });
  };

  const addRow = (key: 'apiHeaders' | 'apiQueryParams') => {
    const cur = key === 'apiHeaders' ? d0.apiHeaders ?? [] : d0.apiQueryParams ?? [];
    setRows(key, [...cur, { key: '', value: '' }]);
  };

  const patchRow = (key: 'apiHeaders' | 'apiQueryParams', index: number, field: 'key' | 'value', value: string) => {
    const cur = [...(key === 'apiHeaders' ? d0.apiHeaders ?? [] : d0.apiQueryParams ?? [])];
    if (!cur[index]) return;
    cur[index] = { ...cur[index], [field]: value };
    setRows(key, cur);
  };

  const removeRow = (key: 'apiHeaders' | 'apiQueryParams', index: number) => {
    const cur = key === 'apiHeaders' ? [...(d0.apiHeaders ?? [])] : [...(d0.apiQueryParams ?? [])];
    cur.splice(index, 1);
    if (!cur.length) cur.push({ key: '', value: '' });
    setRows(key, cur);
  };

  useLayoutEffect(() => {
    const nodeEl = nodeRef.current;
    if (!nodeEl) return;

    const measure = () => {
      const nr = nodeEl.getBoundingClientRect();
      const nodeH = nr.height || 120;

      const rowCenterY = (el: HTMLElement | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - nr.top;
      };

      if (!reqExpanded) {
        const cy = rowCenterY(collapsedBarRef.current) ?? nodeH / 2;
        const spread = Math.min(16, Math.max(11, nodeH * 0.12));
        setHandlePos({
          inY: cy,
          successY: Math.max(cy - spread * 0.55, 12),
          failY: Math.min(cy + spread * 0.55, nodeH - 12),
        });
        return;
      }

      if (!sendStripRef.current) {
        setHandlePos({
          inY: nodeH / 2,
          successY: Math.max(nodeH / 2 - 10, 8),
          failY: Math.min(nodeH / 2 + 10, nodeH - 8),
        });
        return;
      }

      const sr = sendStripRef.current.getBoundingClientRect();
      const stripTop = sr.top - nr.top;
      const stripH = sr.height || 48;
      const stripMidY = stripTop + stripH / 2;

      const inY = rowCenterY(sendLaneRef.current) ?? stripMidY;
      const successY = rowCenterY(successLineRef.current) ?? stripTop + stripH * 0.33;
      const failY = rowCenterY(failLineRef.current) ?? stripTop + stripH * 0.67;

      setHandlePos({
        inY,
        successY,
        failY,
      });
    };

    measure();
    let raf = 0;
    if (typeof requestAnimationFrame !== 'undefined') {
      raf = requestAnimationFrame(() => {
        measure();
        requestAnimationFrame(measure);
      });
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    reqExpanded,
    reqTabPanelOpen,
    reqTab,
    d0.url,
    d0.apiHeaders,
    d0.apiQueryParams,
    d0.successMessageText,
    d0.errorMessageText,
    layoutTick,
    ioTab,
    d0.requestBodyJson,
    d0.responseBodyJson,
  ]);

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, handlePos.inY, handlePos.successY, handlePos.failY, reqExpanded, updateNodeInternals]);

  const tabCls = (active: boolean) =>
    `border-b-2 px-2 py-1.5 text-[10px] font-bold transition-colors ${
      active
        ? 'border-blue-600 text-blue-600 dark:border-sky-400 dark:text-sky-300'
        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div
      ref={nodeRef}
      className="relative w-[440px] max-w-[calc(100vw-3rem)]"
      onMouseEnter={onNodeMenuEnter}
      onMouseLeave={onNodeMenuLeave}
    >
      <NodeToolbar
        isVisible={selected || nodeMenuHover}
        position={Position.Top}
        offset={10}
        align="start"
        className="flex flex-col gap-1"
      >
        <div
          className={`inline-flex w-max max-w-[calc(100vw-3rem)] flex-nowrap items-center justify-start gap-1 rounded-full border px-2 py-1.5 shadow-lg ${theme.toolbar}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={onNodeMenuEnter}
          onMouseLeave={onNodeMenuLeave}
        >
          <button
            type="button"
            title="Add blank API node"
            aria-label="Add blank API node"
            onClick={() => studio?.addBlankApiNode()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-violet-500/45 bg-violet-500/10 text-violet-700 transition-colors hover:bg-violet-500/20 dark:border-violet-400/45 dark:text-violet-200 dark:hover:bg-violet-500/15"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>

          <div className="relative">
            <button
              type="button"
              title="Settings — open API panel"
              onClick={() => {
                studio?.openApiInspector(id);
              }}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              title="Color"
              onClick={() => {
                setPaletteOpen((v) => !v);
              }}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
            {paletteOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-900">
                {(Object.keys(API_ACCENTS) as ApiAccent[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => {
                      updateData({ apiAccent: c });
                      setPaletteOpen(false);
                    }}
                    className={`h-6 w-6 rounded-full ring-2 ring-offset-1 ring-offset-white ${API_ACCENTS[c].header} ${
                      accent === c ? 'ring-blue-500' : 'ring-transparent'
                    } dark:ring-offset-slate-900`}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Run request"
            disabled={running}
            onClick={() => void runRequest()}
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          <button
            type="button"
            title="Duplicate node"
            onClick={onDuplicate}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            title="Delete node"
            onClick={onDelete}
            className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </NodeToolbar>

      <Handle
        type="target"
        position={Position.Left}
        id="api-in"
        className={ovalHandleClass}
        style={{ top: `${handlePos.inY}px` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="api-success"
        className={ovalHandleClass}
        style={{ top: `${handlePos.successY}px` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="api-fail"
        className={ovalHandleClass}
        style={{ top: `${handlePos.failY}px` }}
      />

      <div className={`overflow-hidden rounded-lg border bg-white shadow-lg dark:bg-slate-900 ${theme.border}`}>
        {reqExpanded ? (
          <div className={`flex flex-wrap items-center gap-1.5 px-2 py-2 text-white ${theme.header}`}>
            <select
              value={String(d0.method || 'GET').toUpperCase()}
              onChange={(e) => updateData({ method: e.target.value })}
              className="max-w-[5.5rem] shrink-0 rounded border border-white/40 bg-white/15 px-1 py-1 text-[9px] font-bold uppercase text-white outline-none"
              title="HTTP method"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-slate-800 text-white">
                  {m}
                </option>
              ))}
            </select>
            <input
              value={String(d0.apiName ?? '')}
              onChange={(e) => updateData({ apiName: e.target.value })}
              className="min-w-0 flex-1 rounded border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white placeholder:text-white/50 outline-none"
              placeholder="API name"
            />
            <button
              type="button"
              onClick={() => setReqExpanded(false)}
              className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10"
              title="Collapse — URL only"
            >
              HTTP Request
              <Info className="h-3 w-3 opacity-90" />
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            ref={collapsedBarRef}
            className={`flex min-h-[40px] items-center justify-between gap-2 px-2 py-2 text-white ${theme.header}`}
          >
            <span className="truncate text-[10px] font-bold">HTTP Request</span>
            <button
              type="button"
              onClick={() => setReqExpanded(true)}
              className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10"
              title="Expand full request"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div
          className={`space-y-2 border-b border-slate-100 p-2 dark:border-slate-800 ${!reqExpanded ? 'border-b-0' : ''}`}
        >
          {reqExpanded && (
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Request URL
            </label>
          )}
          <div className="relative">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <input
                type="text"
                value={String(d0.url || '')}
                onChange={(e) => updateData({ url: e.target.value })}
                onFocus={onUrlFieldFocus}
                onBlur={onUrlFieldBlur}
                className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-800 outline-none dark:text-slate-200"
                placeholder="https://… or search presets"
                autoComplete="off"
              />
              {Boolean(d0.url) && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                  onClick={() => updateData({ url: '' })}
                  aria-label="Clear URL"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {urlSuggestOpen && urlPresetMatches.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                role="listbox"
              >
                {urlPresetMatches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      className="w-full px-2 py-1.5 text-left text-[10px] text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyUrlPreset(p)}
                    >
                      <span className="font-medium">{p.label}</span>
                      <span className="block truncate text-slate-500 dark:text-slate-400">{p.patch.url}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {reqExpanded && (
            <>
              <div className="flex items-stretch gap-1 border-b border-slate-100 pb-2 dark:border-slate-800">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  <button type="button" className={tabCls(reqTab === 'headers')} onClick={() => setReqTab('headers')}>
                    Headers
                  </button>
                  <button type="button" className={tabCls(reqTab === 'query')} onClick={() => setReqTab('query')}>
                    Query Params
                  </button>
                  <button
                    type="button"
                    className={tabCls(reqTab === 'outputMsg')}
                    onClick={() => setReqTab('outputMsg')}
                  >
                    Output Messages
                  </button>
                </div>
                <button
                  type="button"
                  title={reqTabPanelOpen ? 'Collapse tab panels' : 'Expand tab panels'}
                  className="inline-flex shrink-0 items-center justify-center rounded border border-transparent px-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  onClick={() => setReqTabPanelOpen((v) => !v)}
                >
                  {reqTabPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {reqTabPanelOpen && (
                <>
                  {reqTab === 'headers' && (
                    <div className="space-y-1.5">
                      {(d0.apiHeaders ?? []).map((row, i) => (
                        <div key={`h-${i}`} className="flex gap-1">
                          <input
                            className="w-1/2 rounded border border-slate-200 px-1.5 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                            placeholder="Key"
                            value={row.key}
                            onChange={(e) => patchRow('apiHeaders', i, 'key', e.target.value)}
                          />
                          <input
                            className="w-1/2 rounded border border-slate-200 px-1.5 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                            placeholder="Value"
                            value={row.value}
                            onChange={(e) => patchRow('apiHeaders', i, 'value', e.target.value)}
                          />
                          <button
                            type="button"
                            className="shrink-0 text-slate-400 hover:text-red-500"
                            onClick={() => removeRow('apiHeaders', i)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-sky-400"
                        onClick={() => addRow('apiHeaders')}
                      >
                        + Add Header
                      </button>
                    </div>
                  )}

                  {reqTab === 'query' && (
                    <div className="space-y-1.5">
                      {(d0.apiQueryParams ?? []).map((row, i) => (
                        <div key={`q-${i}`} className="flex gap-1">
                          <input
                            className="w-1/2 rounded border border-slate-200 px-1.5 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                            placeholder="Key"
                            value={row.key}
                            onChange={(e) => patchRow('apiQueryParams', i, 'key', e.target.value)}
                          />
                          <input
                            className="w-1/2 rounded border border-slate-200 px-1.5 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                            placeholder="Value"
                            value={row.value}
                            onChange={(e) => patchRow('apiQueryParams', i, 'value', e.target.value)}
                          />
                          <button
                            type="button"
                            className="shrink-0 text-slate-400 hover:text-red-500"
                            onClick={() => removeRow('apiQueryParams', i)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-sky-400"
                        onClick={() => addRow('apiQueryParams')}
                      >
                        + Add param
                      </button>
                    </div>
                  )}

                  {reqTab === 'outputMsg' && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        Success Message
                        <textarea
                          value={String(d0.successMessageText ?? '')}
                          onChange={(e) => updateData({ successMessageText: e.target.value })}
                          rows={3}
                          className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                          placeholder="Message when the request succeeds…"
                        />
                      </label>
                      <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        Error Message
                        <textarea
                          value={String(d0.errorMessageText ?? '')}
                          onChange={(e) => updateData({ errorMessageText: e.target.value })}
                          rows={3}
                          className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                          placeholder="Message when the request fails…"
                        />
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* Flow connectors: left = Send, right = Success / Fail (positions measured from this strip). */}
              <div
                ref={sendStripRef}
                className="relative mt-3 min-h-[4rem] border-y border-slate-100 bg-slate-50/90 px-2 py-2.5 dark:border-slate-800 dark:bg-slate-950/70"
              >
                <div className="flex min-h-[3.25rem] items-stretch justify-between gap-4">
                  <div
                    ref={sendLaneRef}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <Radio className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                    <span className="font-bold tracking-tight">Send</span>
                  </div>
                  <div className="flex min-w-0 flex-col items-end justify-center gap-2 text-right">
                    <div ref={successLineRef} className="flex min-h-[1.35rem] w-full items-center justify-end">
                      <span className="text-[11px] font-bold tracking-tight text-slate-800 dark:text-slate-200">
                        Success
                      </span>
                    </div>
                    <div ref={failLineRef} className="flex min-h-[1.35rem] w-full items-center justify-end">
                      <span className="text-[11px] font-bold tracking-tight text-slate-800 dark:text-slate-200">
                        Fail
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {reqExpanded && (
          <div className="p-2">
            <div className="mb-1.5 flex rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1.5 text-[10px] font-bold ${
                  ioTab === 'input' ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'
                }`}
                onClick={() => setIoTab('input')}
              >
                Input
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1.5 text-[10px] font-bold ${
                  ioTab === 'output' ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'
                }`}
                onClick={() => setIoTab('output')}
              >
                Output
              </button>
            </div>

            {ioTab === 'input' && (
              <textarea
                value={String(d0.requestBodyJson ?? '')}
                onChange={(e) => updateData({ requestBodyJson: e.target.value })}
                rows={8}
                className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder="Request JSON body (POST/PUT/PATCH)…"
                spellCheck={false}
              />
            )}

            {ioTab === 'output' && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                    {d0.responseStatus != null ? (
                      <>
                        Response <span className="text-emerald-600 dark:text-emerald-400">({d0.responseStatus})</span>
                      </>
                    ) : (
                      'Response'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={copyOutput}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Copy JSON"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <CollapsibleJsonView jsonText={String(d0.responseBodyJson ?? '')} size="fit" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
