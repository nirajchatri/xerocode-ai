import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeToolbar, Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Copy, Palette, Plus, Settings, Trash2 } from 'lucide-react';

import type { AgentNodeData } from '../agentNodeData';
import type { DataFieldKind } from '../agentNodeData';
import type { DataListBarAccent } from '../agentNodeData';
import type { DataListFieldMappingRow } from '../agentNodeData';
import { DATA_FIELD_KINDS } from '../agentNodeData';
import { normalizeDataListMappings } from '../agentNodeData';
import { appearanceForDataField, dataListBarClass, DATA_LIST_BAR_SWATCHES } from '../dataNodeAppearance';
import { useAgentStudioActions } from '../AgentStudioActionsContext';
import { CollapsibleJsonView } from '../CollapsibleJsonView';
import { DataListFieldMappingsEditor } from '../DataListFieldMappingsEditor';
import { collectJsonPathStrings } from '../dataListPathUtils';
import { recomputeDataListDisplayIfSample } from '../apiListPropagation';

function resolveKind(raw: AgentNodeData | undefined): DataFieldKind {
  const k = raw?.dataFieldKind;
  if (k && DATA_FIELD_KINDS.includes(k)) return k;
  return 'string';
}

function summarizeValue(kind: DataFieldKind, raw: string | undefined): string {
  const v = String(raw ?? '').trim();
  if (kind === 'boolean') return v === 'true' ? 'True' : 'False';
  if (kind === 'list') {
    if (!v) return '(no output)';
    try {
      const o = JSON.parse(v);
      if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
        const n = Object.keys(o).length;
        return n ? `${n} key(s)` : '(empty object)';
      }
      if (Array.isArray(o)) return `${o.length} item(s)`;
      return `(scalar)`;
    } catch {
      const lines = v.split(/\r?\n/).filter((l) => l.trim());
      return lines.length ? `${lines.length} line(s)` : '(invalid JSON)';
    }
  }
  if (!v) return `(empty)`;
  return v.length > 48 ? `${v.slice(0, 48)}…` : v;
}

const listToolbarClass =
  'inline-flex w-max max-w-[calc(100vw-3rem)] flex-nowrap items-center justify-start gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900';

export function DataWorkflowNode({ id, data, selected }: NodeProps) {
  const { setNodes, setEdges, getNode } = useReactFlow();
  const studio = useAgentStudioActions();
  const d = (data || {}) as AgentNodeData;
  const kind = resolveKind(d);
  const ui = appearanceForDataField(kind) ?? appearanceForDataField('string')!;
  const Icon = ui.Icon;
  const title = String(d.dataNodeLabel || '').trim() || ui.label;
  const preview = useMemo(() => summarizeValue(kind, d.dataRawValue), [kind, d.dataRawValue]);
  const listBar =
    kind === 'list'
      ? dataListBarClass(d.dataListBarAccent)
      : ui.bar;

  const listMappings = useMemo(() => normalizeDataListMappings(d), [d.dataListFieldMappings, d.dataListKeyName, d.dataListFieldPath]);

  const pathSuggestions = useMemo(() => {
    const raw = String(d.dataListSampleJson ?? '').trim();
    if (!raw) return [];
    try {
      return collectJsonPathStrings(JSON.parse(raw));
    } catch {
      return [];
    }
  }, [d.dataListSampleJson]);

  const nodeRef = useRef<HTMLDivElement>(null);
  const [nodeMenuHover, setNodeMenuHover] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const updateData = useCallback(
    (patch: Partial<AgentNodeData>) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const prev = (node.data || {}) as AgentNodeData;
          return { ...node, data: { ...prev, ...patch } };
        })
      );
    },
    [id, setNodes]
  );

  const applyMappings = useCallback(
    (rows: DataListFieldMappingRow[]) => {
      const merged: AgentNodeData = {
        ...(d as AgentNodeData),
        dataListFieldMappings: rows,
        dataListKeyName: '',
        dataListFieldPath: '',
      };
      const reco = recomputeDataListDisplayIfSample(merged);
      updateData({
        dataListFieldMappings: rows,
        dataListKeyName: '',
        dataListFieldPath: '',
        ...(reco ? { dataRawValue: reco.dataRawValue } : {}),
      });
    },
    [d, updateData]
  );

  const applyUseFullJson = useCallback(
    (useFull: boolean) => {
      const merged: AgentNodeData = {
        ...(d as AgentNodeData),
        dataListUseFullJson: useFull,
      };
      const reco = recomputeDataListDisplayIfSample(merged);
      updateData({
        dataListUseFullJson: useFull,
        ...(reco ? { dataRawValue: reco.dataRawValue } : {}),
      });
    },
    [d, updateData]
  );

  const onDelete = useCallback(() => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, setEdges, setNodes]);

  const onDuplicate = useCallback(() => {
    const me = getNode(id);
    if (!me) return;
    const newId = `data-${Date.now()}`;
    const prev = (me.data || {}) as AgentNodeData;
    setNodes((nds) => [
      ...nds,
      {
        ...me,
        id: newId,
        position: { x: me.position.x + 48, y: me.position.y + 48 },
        selected: false,
        data: { ...prev, nid: newId },
      },
    ]);
  }, [id, getNode, setNodes]);

  const listAccent = (d.dataListBarAccent as DataListBarAccent | undefined) ?? 'emerald';

  const body = (
    <div className="relative w-[300px] max-w-[calc(100vw-3rem)] rounded-lg border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />
      <div className={`flex items-center justify-between rounded-t-md px-2 py-1.5 text-[11px] font-bold text-white ${listBar}`}>
        <span className="inline-flex min-w-0 items-center gap-1">
          <Icon className="h-3 w-3 shrink-0 opacity-95" aria-hidden />
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 rounded bg-white/20 px-1 text-[9px] font-mono">{String(d.nid ?? '').slice(-4)}</span>
      </div>
      <div className="space-y-1.5 p-2">
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Data · {ui.label}</p>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {preview}
        </div>
        {kind === 'list' && (
          <>
            <DataListFieldMappingsEditor
              mappings={listMappings}
              onChange={applyMappings}
              pathSuggestions={pathSuggestions}
              variant="compact"
            />
            <label className="flex cursor-pointer items-start gap-2 text-[10px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={d.dataListUseFullJson === true}
                onChange={(e) => applyUseFullJson(e.target.checked)}
                className="mt-0.5 rounded border-slate-400"
              />
              <span>Use full JSON response</span>
            </label>
            <div className="space-y-1">
              <label className="block text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Extracted key-value pairs
              </label>
              <CollapsibleJsonView
                jsonText={String(d.dataRawValue ?? '')}
                size="fit"
                emptyHint="Connect API → Run workflow. Keys fill from mapped field paths."
                className="!max-h-52 border-slate-200 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </>
        )}
        {kind !== 'list' && (
          <div className="space-y-1">
            <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">Value</label>
            <DataWorkflowValueInput kind={kind} value={d.dataRawValue ?? ''} onCommit={(next) => updateData({ dataRawValue: next })} />
          </div>
        )}
      </div>
    </div>
  );

  if (kind !== 'list') {
    return body;
  }

  return (
    <div
      ref={nodeRef}
      className="relative"
      onMouseEnter={onNodeMenuEnter}
      onMouseLeave={onNodeMenuLeave}
    >
      <NodeToolbar
        isVisible={Boolean(selected || nodeMenuHover)}
        position={Position.Top}
        offset={10}
        align="start"
        className="flex flex-col gap-1"
      >
        <div
          className={listToolbarClass}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={onNodeMenuEnter}
          onMouseLeave={onNodeMenuLeave}
        >
          <button
            type="button"
            title="Add Data List node"
            aria-label="Add Data List node"
            onClick={() => studio?.addDataListNode()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-emerald-500/45 bg-emerald-500/10 text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:border-emerald-400/45 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>

          <button
            type="button"
            title="List settings — opens in side panel"
            aria-label="List settings — opens in side panel"
            onClick={() => studio?.openApiInspector(id)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              title="Color"
              onClick={() => setPaletteOpen((v) => !v)}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
            {paletteOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-900">
                {DATA_LIST_BAR_SWATCHES.map(({ key, header }) => (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    onClick={() => {
                      updateData({ dataListBarAccent: key });
                      setPaletteOpen(false);
                    }}
                    className={`h-6 w-6 rounded-full ring-2 ring-offset-1 ring-offset-white ${header} ${
                      listAccent === key ? 'ring-blue-500' : 'ring-transparent'
                    } dark:ring-offset-slate-900`}
                  />
                ))}
              </div>
            )}
          </div>

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
      {body}
    </div>
  );
}

export function DataWorkflowValueInput({
  kind,
  value,
  onCommit,
  inputClassName,
  textareaClassName,
}: {
  kind: DataFieldKind;
  value: string;
  onCommit: (next: string) => void;
  /** Optional (e.g. inspector dark mode). Defaults match the canvas chip. */
  inputClassName?: string;
  textareaClassName?: string;
}) {
  const ic =
    inputClassName ??
    'w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950';
  const ta =
    textareaClassName ??
    'w-full resize-y rounded border border-slate-200 px-2 py-1 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-950';
  switch (kind) {
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onCommit(e.target.checked ? 'true' : 'false')}
            className="rounded border-slate-400"
          />
          {value === 'true' ? 'True' : 'False'}
        </label>
      );
    case 'number':
      return (
        <input type="number" step={1} value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
    case 'decimal':
      return (
        <input type="number" step="any" value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
    case 'date':
      return (
        <input type="date" value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
    case 'time':
      return (
        <input type="time" value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
    case 'datetime':
      return (
        <input type="datetime-local" value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
    case 'list':
      return (
        <textarea
          rows={6}
          value={value}
          onChange={(e) => onCommit(e.target.value)}
          spellCheck={false}
          placeholder="One item per line"
          className={ta}
        />
      );
    default:
      return (
        <input type="text" value={value} onChange={(e) => onCommit(e.target.value)} className={ic} />
      );
  }
}
