import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node as FlowNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Braces,
  Calendar,
  CalendarClock,
  Clock,
  Download,
  Eye,
  Globe,
  Link2,
  Loader2,
  List,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sparkles,
  Upload,
  GitBranch,
  Flag,
  X,
  Zap,
} from 'lucide-react';

import { apiUrl, getStudioAuthHeaders, readApiJson, studioFetch } from '../../lib/apiBase';
import {
  computeWorkflowRunOrder,
  findStartNodeId,
  summarizeNode,
} from '../../lib/workflowRunOrder.js';

import { ApiWorkflowNode } from './nodes/ApiWorkflowNode';
import { AgentLlmWorkflowNode } from './nodes/AgentLlmWorkflowNode';
import { EndWorkflowNode } from './nodes/EndWorkflowNode';
import { GuardrailsWorkflowNode } from './nodes/GuardrailsWorkflowNode';
import { IfElseWorkflowNode } from './nodes/IfElseWorkflowNode';
import { McpWorkflowNode } from './nodes/McpWorkflowNode';
import { DataWorkflowNode, DataWorkflowValueInput } from './nodes/DataWorkflowNode';
import {
  blankApiNodeData,
  defaultApiNodeData,
  defaultDataNodeData,
  defaultDataRawForKind,
  DATA_FIELD_KINDS,
  DATA_FIELD_LABELS,
  DATA_FIELD_MENU_HINTS,
  DEFAULT_AGENT_INSTRUCTIONS,
  defaultIfElseBranches,
  emptyDataListMappingRow,
  normalizeApiData,
  normalizeDataListMappings,
  type AgentNodeData,
  type DataFieldKind,
  type DataListBarAccent,
  type DataListFieldMappingRow,
} from './agentNodeData';
import { runAgentApiRequest } from './apiRequestRunner';
import { AgentStudioActionsProvider } from './AgentStudioActionsContext';
import { AgentEndChatModal } from './AgentEndChatModal';
import { AgentInspectorPanel } from './AgentInspectorPanel';
import { ApiInspectorPanel } from './ApiInspectorPanel';
import { EndInspectorPanel } from './EndInspectorPanel';
import { GuardrailsInspectorPanel } from './GuardrailsInspectorPanel';
import { IfElseInspectorPanel } from './IfElseInspectorPanel';
import { McpInspectorPanel } from './McpInspectorPanel';
import { McpSquiggleLogo } from './McpSquiggleLogo';
import { applyApiSuccessToConnectedListNodes, recomputeDataListDisplayIfSample } from './apiListPropagation';
import { appearanceForDataField, dataListBarClass } from './dataNodeAppearance';
import { CollapsibleJsonView } from './CollapsibleJsonView';
import { DataListFieldMappingsEditor } from './DataListFieldMappingsEditor';
import { collectJsonPathStrings } from './dataListPathUtils';

export type { AgentNodeData } from './agentNodeData';

const AGENT_STUDIO_STORAGE_KEY = 'xerocode_agent_studio_draft_v1';

type AgentStudioKind = 'standalone' | 'managerial';

type WorkflowNodeType = 'start' | 'end' | 'api' | 'llm' | 'mcp' | 'guardrails' | 'if_else' | 'data';

type NonDataAgentType = Exclude<WorkflowNodeType, 'start' | 'data'>;

const ADD_MENU_AGENTS: ReadonlyArray<{
  type: NonDataAgentType;
  label: string;
  hint: string;
  Icon: LucideIcon;
}> = [
  { type: 'api', label: 'API', hint: 'REST / GraphQL call', Icon: Globe },
  { type: 'llm', label: 'Agent', hint: 'Model · tools · prompts', Icon: Sparkles },
  { type: 'mcp', label: 'MCP Server', hint: 'Tools & resources', Icon: Link2 },
  { type: 'guardrails', label: 'Guardrails', hint: 'Rules & safety', Icon: Shield },
  { type: 'end', label: 'End', hint: 'Output · run workflow chat from here', Icon: Flag },
];

/** Logic palette — single entry for the If / else node. */
const ADD_MENU_LOGIC: ReadonlyArray<{
  label: string;
  hint: string;
  Icon: LucideIcon;
}> = [
  {
    label: 'If or else',
    hint: 'Logic · If, else-if, and CEL expressions to branch your workflow',
    Icon: GitBranch,
  },
];

const HEADER: Record<Exclude<WorkflowNodeType, 'start'>, { title: string; bar: string; icon: typeof Zap }> = {
  api: { title: 'API', bar: 'bg-sky-500', icon: Globe },
  llm: { title: 'Agent', bar: 'bg-violet-500', icon: Sparkles },
  mcp: { title: 'MCP Server', bar: 'bg-emerald-500', icon: Link2 },
  guardrails: { title: 'Guardrails', bar: 'bg-rose-500', icon: Shield },
  if_else: { title: 'If / else', bar: 'bg-violet-600', icon: GitBranch },
  end: { title: 'End', bar: 'bg-teal-600', icon: Flag },
  data: { title: 'Data', bar: 'bg-cyan-600', icon: Braces },
};

function subtitleForType(t: Exclude<WorkflowNodeType, 'start'>): string {
  switch (t) {
    case 'api':
      return 'REST / webhook caller';
    case 'llm':
      return 'Call the model with your instructions and tools';
    case 'mcp':
      return 'Model Context Protocol';
    case 'guardrails':
      return 'Run moderation, PII, jailbreak, or hallucination checks';
    case 'if_else':
      return 'Branch workflow with Common Expression Language';
    case 'end':
      return 'Marks workflow output — open chat to run and reply';
    case 'data':
      return 'Typed field for workflow wiring';
    default:
      return '';
  }
}

function defaultAgentData(t: Exclude<WorkflowNodeType, 'start'>, nid: string): AgentNodeData {
  const base: AgentNodeData = { nid, subtitle: subtitleForType(t) };
  switch (t) {
    case 'api':
      return defaultApiNodeData(nid);
    case 'llm':
      return {
        ...base,
        agentBarAccent: 'violet',
        model: 'gpt-4.1-mini',
        systemPrompt: DEFAULT_AGENT_INSTRUCTIONS,
        temperature: 1,
        agentIncludeChatHistory: true,
        agentTools: [],
        agentOutputFormat: 'json',
        agentResponseSchemaEnabled: true,
        agentMaxTokens: 2048,
        agentTopP: 1,
        agentChatkitDisplayResponse: true,
        agentChatkitShowProgress: true,
        agentChatkitShowSources: true,
        agentContinueOnError: false,
        agentWriteToHistory: true,
      };
    case 'mcp':
      return {
        ...base,
        serverUrl: '',
        transport: 'http',
        mcpServerLabel: '',
        mcpDescription: '',
        mcpAuthType: 'access_token',
        mcpAccessToken: '',
        mcpBarAccent: 'emerald',
      };
    case 'guardrails':
      return { ...base, rulesText: '', blockPii: false, requireCitations: false, guardrailBarAccent: 'rose' };
    case 'if_else':
      return {
        ...base,
        ifElseBarAccent: 'violet',
        ifElseBranches: defaultIfElseBranches(),
      };
    case 'end':
      return { ...base, endBarAccent: 'teal', endNodeLabel: '' };
    case 'data':
      return defaultDataNodeData(nid, 'string');
    default:
      return base;
  }
}

function StartNode(_props: NodeProps) {
  return (
    <div className="relative">
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-orange-500" />
      <div className="rounded-lg border-2 border-orange-400 bg-gradient-to-b from-orange-50 to-amber-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-orange-900 shadow-md">
        Start
      </div>
    </div>
  );
}

const DATA_MENU_GLYPH_BOX =
  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

/** Left tile in the add-menu Data section (reference: bordered square + label + description). */
function DataPaletteGlyph({ kind }: { kind: DataFieldKind }) {
  switch (kind) {
    case 'string':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <span className="text-[12px] font-semibold">Aa</span>
        </span>
      );
    case 'boolean':
      return (
        <span className={`${DATA_MENU_GLYPH_BOX} gap-1`}>
          <span className="rounded border border-slate-300 px-1 py-0.5 text-[9px] font-bold leading-none dark:border-slate-500">0</span>
          <span className="rounded border border-slate-300 px-1 py-0.5 text-[9px] font-bold leading-none dark:border-slate-500">1</span>
        </span>
      );
    case 'number':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <span className="text-[10px] font-bold tabular-nums tracking-tight">123</span>
        </span>
      );
    case 'decimal':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <span className="text-[10px] font-semibold tabular-nums">0.0</span>
        </span>
      );
    case 'date':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <Calendar className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      );
    case 'time':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      );
    case 'datetime':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      );
    case 'list':
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <List className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      );
    default:
      return (
        <span className={DATA_MENU_GLYPH_BOX}>
          <span className="text-[10px] font-semibold">?</span>
        </span>
      );
  }
}

const nodeTypes = {
  start: StartNode,
  api: ApiWorkflowNode,
  llm: AgentLlmWorkflowNode,
  mcp: McpWorkflowNode,
  guardrails: GuardrailsWorkflowNode,
  if_else: IfElseWorkflowNode,
  end: EndWorkflowNode,
  data: DataWorkflowNode,
};

const initialNodes: FlowNode[] = [
  {
    id: 'start',
    type: 'start',
    position: { x: 40, y: 200 },
    data: { label: 'Start' },
  },
];

const initialEdges: Edge[] = [];

/** React Flow draws animated edges as marching dashes; keep connections solid and thick. */
const SOLID_EDGE_DEFAULTS: Pick<Edge, 'animated'> & { style: React.CSSProperties } = {
  animated: false,
  style: { strokeWidth: 3.25 },
};

function normalizeWorkflowEdges(eds: Edge[]): Edge[] {
  return eds.map((e) => {
    const prev = (e.style && typeof e.style === 'object' ? e.style : {}) as Record<string, unknown>;
    const style = {
      ...prev,
      ...SOLID_EDGE_DEFAULTS.style,
    };
    delete style.strokeDasharray;
    return {
      ...e,
      animated: false,
      type: e.type ?? 'smoothstep',
      style,
    };
  });
}

const NODE_MINI_COLORS: Partial<Record<WorkflowNodeType, string>> = {
  start: '#f97316',
  api: '#0ea5e9',
  llm: '#8b5cf6',
  mcp: '#10b981',
  guardrails: '#f43f5e',
  if_else: '#7c3aed',
  end: '#0d9488',
};

/** MiniMap tint for typed data nodes — aligned with accent bars. */
const DATA_MINIMAP_COLORS: Record<DataFieldKind, string> = {
  string: '#0891b2',
  number: '#4f46e5',
  boolean: '#c026d3',
  decimal: '#0d9488',
  date: '#d97706',
  time: '#ea580c',
  datetime: '#65a30d',
  list: '#059669',
};

function minimapColorForFlowNode(node: FlowNode): string {
  if (node.type === 'data') {
    const dk = ((node.data || {}) as AgentNodeData)?.dataFieldKind;
    if (dk != null && dk in DATA_MINIMAP_COLORS) return DATA_MINIMAP_COLORS[dk];
    return DATA_MINIMAP_COLORS.string;
  }
  const solid = node.type ? NODE_MINI_COLORS[node.type as WorkflowNodeType] : undefined;
  return solid ?? '#94a3b8';
}

/** Prefer selected End node if highlighted; otherwise first End on canvas. */
function resolveWorkflowEndChatTarget(nodes: FlowNode[], selectedId: string | null): string | null {
  const ends = nodes.filter((n) => n.type === 'end');
  if (!ends.length) return null;
  if (selectedId && ends.some((e) => e.id === selectedId)) return selectedId;
  return ends[0]!.id;
}

function nextNodePosition(existing: FlowNode[]): { x: number; y: number } {
  const n = existing.filter((x) => x.type !== 'start').length;
  return { x: 320 + (n % 3) * 40, y: 120 + Math.floor(n / 3) * 160 };
}

export interface AgentWorkflowCanvasProps {
  isDarkMode: boolean;
  agentKind: AgentStudioKind | null;
  /** When set, shows a back control in the playground header (e.g. return to agent type). */
  onBackToAgentType?: () => void;
  /** Hydrate from a row returned by GET /api/agents (opens a saved workflow). */
  savedAgentSnapshot?: {
    id: string;
    workflowName: string;
    nodes: FlowNode[];
    edges: Edge[];
  } | null;
  /** After POST /api/agents succeeds, parent can refetch the list. */
  onSavedToDatabase?: () => void;
}

type RunStep = { id: string; kind: string; title: string; detail: string };

const inputBase = (isDark: boolean) =>
  `w-full rounded-md border px-2 py-1.5 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;

const labelCls = (isDark: boolean) => (isDark ? 'text-slate-400' : 'text-slate-600');

interface InspectorProps {
  node: FlowNode;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
  onDeselect: () => void;
  syncApiSuccessToLists?: (apiNodeId: string, responseBodyJson: string, responseStatus: number | null) => void;
  onDeleteSelectedNode?: () => void;
}

function NodeInspector({
  node,
  isDarkMode,
  onPatch,
  onDeselect,
  syncApiSuccessToLists,
  onDeleteSelectedNode,
}: InspectorProps) {
  const d = (node.data || {}) as AgentNodeData;
  const t = node.type as WorkflowNodeType;

  const listInspectorPathSuggestions = useMemo(() => {
    const dd = (node.data || {}) as AgentNodeData;
    if (node.type !== 'data' || dd.dataFieldKind !== 'list') return [];
    const raw = String(dd.dataListSampleJson ?? '').trim();
    if (!raw) return [];
    try {
      return collectJsonPathStrings(JSON.parse(raw));
    } catch {
      return [];
    }
  }, [node.type, node.data]);

  if (t === 'start') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Start</p>
          <button
            type="button"
            onClick={onDeselect}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Entry point for this workflow. Connect outgoing edges to your first agent blocks.
        </p>
      </div>
    );
  }

  if (t === 'data') {
    const ap = appearanceForDataField(d.dataFieldKind || 'string')!;
    const Icon = ap.Icon;
    const kind = (d.dataFieldKind && DATA_FIELD_KINDS.includes(d.dataFieldKind) ? d.dataFieldKind : 'string') as DataFieldKind;
    const dataIc = inputBase(isDarkMode);
    const dataTa = `${inputBase(isDarkMode)} resize-y font-mono text-[11px]`;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${kind === 'list' ? dataListBarClass(d.dataListBarAccent) : ap.bar}`}>
              <Icon className="h-4 w-4" />
            </span>
            Data · {ap.label}
          </span>
          <button
            type="button"
            onClick={onDeselect}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <label className={labelCls(isDarkMode)}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Display name</span>
            <input
              value={String(d.dataNodeLabel || '')}
              onChange={(e) => onPatch({ dataNodeLabel: e.target.value })}
              className={dataIc}
              placeholder={ap.label}
            />
          </label>
          <label className={labelCls(isDarkMode)}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Data type</span>
            <select
              value={kind}
              onChange={(e) => {
                const nk = e.target.value as DataFieldKind;
                const patch: Partial<AgentNodeData> = {
                  dataFieldKind: nk,
                  dataRawValue: defaultDataRawForKind(nk),
                  subtitle: `Data · ${DATA_FIELD_LABELS[nk]}`,
                };
                if (nk === 'list') {
                  patch.dataListKeyName = '';
                  patch.dataListFieldPath = '';
                  patch.dataListFieldMappings = [emptyDataListMappingRow()];
                  patch.dataListUseFullJson = false;
                  patch.dataListBarAccent = 'emerald';
                }
                onPatch(patch);
              }}
              className={dataIc}
            >
              {DATA_FIELD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATA_FIELD_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {kind === 'list' && (
            <>
              <div className={labelCls(isDarkMode)}>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Field paths and key names</span>
                <DataListFieldMappingsEditor
                  variant="form"
                  isDark={isDarkMode}
                  mappings={normalizeDataListMappings(d)}
                  pathSuggestions={listInspectorPathSuggestions}
                  onChange={(rows: DataListFieldMappingRow[]) => {
                    const merged: AgentNodeData = {
                      ...d,
                      dataListFieldMappings: rows,
                      dataListKeyName: '',
                      dataListFieldPath: '',
                    };
                    const reco = recomputeDataListDisplayIfSample(merged);
                    onPatch({
                      dataListFieldMappings: rows,
                      dataListKeyName: '',
                      dataListFieldPath: '',
                      ...(reco ? { dataRawValue: reco.dataRawValue } : {}),
                    });
                  }}
                />
              </div>
              <label className={`flex cursor-pointer items-start gap-2 text-xs ${labelCls(isDarkMode)}`}>
                <input
                  type="checkbox"
                  checked={d.dataListUseFullJson === true}
                  onChange={(e) => {
                    const useFull = e.target.checked;
                    const merged: AgentNodeData = { ...d, dataListUseFullJson: useFull };
                    const reco = recomputeDataListDisplayIfSample(merged);
                    onPatch({
                      dataListUseFullJson: useFull,
                      ...(reco ? { dataRawValue: reco.dataRawValue } : {}),
                    });
                  }}
                  className="mt-0.5 rounded border-slate-400"
                />
                <span>
                  <span className="font-semibold">Use full JSON</span>
                  <span className="mt-0.5 block text-[10px] font-normal opacity-90">
                    When off, extracted values come from each field path below (e.g. data[0].id). Paths use dots and brackets for arrays.
                  </span>
                </span>
              </label>
              <label className={labelCls(isDarkMode)}>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Extracted output</span>
                <CollapsibleJsonView
                  jsonText={String(d.dataRawValue ?? '')}
                  emptyHint="Connect an API upstream, run the workflow, or edit field paths above."
                  size="fit"
                  className={`border ${isDarkMode ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'} max-h-64`}
                />
              </label>
            </>
          )}
          {kind !== 'list' && (
            <label className={labelCls(isDarkMode)}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Value</span>
              <DataWorkflowValueInput
                kind={kind}
                value={String(d.dataRawValue ?? '')}
                onCommit={(next) => onPatch({ dataRawValue: next })}
                inputClassName={dataIc}
                textareaClassName={dataTa}
              />
            </label>
          )}
        </div>
      </div>
    );
  }

  if (t === 'llm') {
    const agentTitle = String(d.agentDisplayName || '').trim() || 'Agent Name';
    const agentSubtitle =
      String(d.subtitle || '').trim() || 'Call the model with your instructions and tools';

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={`shrink-0 border-b px-3 py-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className={`text-sm font-bold leading-snug ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>
                {agentTitle}
              </h2>
              <p className={`mt-1 text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {agentSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onDeselect}
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <AgentInspectorPanel data={d} isDarkMode={isDarkMode} onPatch={onPatch} />
        </div>
      </div>
    );
  }

  if (t === 'mcp') {
    const bar = dataListBarClass((d.mcpBarAccent ?? 'emerald') as DataListBarAccent);
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={`shrink-0 border-b px-3 py-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${bar}`}>
                <McpSquiggleLogo size="sm" tone="on_bar" />
              </span>
              MCP Server
            </span>
            <button
              type="button"
              onClick={onDeselect}
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <McpInspectorPanel data={d} isDarkMode={isDarkMode} onPatch={onPatch} />
        </div>
      </div>
    );
  }

  if (t === 'end') {
    const bar = dataListBarClass((d.endBarAccent ?? 'teal') as DataListBarAccent);
    const title = String(d.endNodeLabel ?? '').trim() || 'End';
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={`shrink-0 border-b px-3 py-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${bar}`}>
                <Flag className="h-4 w-4" aria-hidden />
              </span>
              {title}
            </span>
            <button
              type="button"
              onClick={onDeselect}
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className={`mt-1 text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Output node. Use the <span className="font-semibold">view (eye) button beside Save</span> in the header to open the agent output chat.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <EndInspectorPanel data={d} isDarkMode={isDarkMode} onPatch={onPatch} />
        </div>
      </div>
    );
  }

  if (t === 'if_else') {
    return (
      <IfElseInspectorPanel
        data={d}
        isDarkMode={isDarkMode}
        onPatch={onPatch}
        onDeleteNode={onDeleteSelectedNode}
        onClose={onDeselect}
      />
    );
  }

  const meta = HEADER[t as NonDataAgentType];
  const Icon = meta.icon;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex shrink-0 items-center justify-between border-b px-3 py-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${meta.bar}`}>
            <Icon className="h-4 w-4" />
          </span>
          {meta.title}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {t === 'api' && (
          <ApiInspectorPanel
            data={d}
            isDarkMode={isDarkMode}
            onPatch={onPatch}
            onRunComplete={(json, status) => syncApiSuccessToLists?.(node.id, json, status)}
          />
        )}
        {t === 'guardrails' && <GuardrailsInspectorPanel data={d} isDarkMode={isDarkMode} onPatch={onPatch} />}
      </div>
    </div>
  );
}

export const AgentWorkflowCanvas: React.FC<AgentWorkflowCanvasProps> = ({
  isDarkMode,
  agentKind,
  onBackToAgentType,
  savedAgentSnapshot = null,
  onSavedToDatabase,
}) => {
  const [workflowName, setWorkflowName] = useState('Agent workflow');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const dropdownSearchRef = useRef<HTMLInputElement | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<RunStep[] | null>(null);
  const [dropdownQuery, setDropdownQuery] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remoteDbAgentId, setRemoteDbAgentId] = useState<string | null>(null);
  const [endChatModalId, setEndChatModalId] = useState<string | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as globalThis.Node;
      if (addMenuRef.current?.contains(t)) return;
      setAddOpen(false);
      setDropdownQuery('');
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    if (savedAgentSnapshot) {
      setWorkflowName(savedAgentSnapshot.workflowName);
      setNodes(savedAgentSnapshot.nodes);
      setEdges(normalizeWorkflowEdges(savedAgentSnapshot.edges));
      setRemoteDbAgentId(savedAgentSnapshot.id);
      setSelectedId(null);
      return;
    }
    /** New session from “Standalone” / “Managerial” — blank canvas (only Start), no browser draft restore. */
    setWorkflowName('Agent workflow');
    setNodes(initialNodes);
    setEdges(initialEdges);
    setRemoteDbAgentId(null);
    setSelectedId(null);
  }, [savedAgentSnapshot?.id, setEdges, setNodes]);

  useEffect(() => {
    if (!addOpen) return;
    requestAnimationFrame(() => dropdownSearchRef.current?.focus());
  }, [addOpen]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: SOLID_EDGE_DEFAULTS.animated,
            style: { ...SOLID_EDGE_DEFAULTS.style },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onSelectionChange = useCallback(
    (sel: { nodes: FlowNode[] }) => {
      if (sel.nodes.length === 1) setSelectedId(sel.nodes[0].id);
      else setSelectedId(null);
    },
    []
  );

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

  const patchSelectedNode = useCallback(
    (patch: Partial<AgentNodeData>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedId) return n;
          const prev = (n.data || {}) as AgentNodeData;
          return { ...n, data: { ...prev, ...patch } };
        })
      );
    },
    [selectedId, setNodes]
  );

  const syncApiSuccessToLists = useCallback(
    (apiNodeId: string, responseBodyJson: string, responseStatus: number | null) => {
      applyApiSuccessToConnectedListNodes({
        apiNodeId,
        responseBodyJson,
        responseStatus,
        getEdges: () => edges,
        setNodes,
      });
    },
    [edges, setNodes]
  );

  const openApiInspector = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes]
  );

  const addBlankApiNode = useCallback(() => {
    const nid = `api-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id: nid,
        type: 'api',
        position: nextNodePosition(nds),
        selected: true,
        data: blankApiNodeData(nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const deselectNodes = useCallback(() => {
    setSelectedId(null);
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
  }, [setNodes]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedId || selectedId === 'start') return;
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, setEdges, setNodes]);

  const addNode = useCallback(
    (nodeType: NonDataAgentType) => {
      const nid = `${nodeType}-${Date.now()}`;
      setNodes((nds) => [
        ...nds,
        {
          id: nid,
          type: nodeType,
          position: nextNodePosition(nds),
          data: defaultAgentData(nodeType, nid),
        },
      ]);
      setAddOpen(false);
      setDropdownQuery('');
    },
    [setNodes]
  );

  const addDataNode = useCallback(
    (fieldKind: DataFieldKind) => {
      const nid = `data-${Date.now()}`;
      setNodes((nds) => [
        ...nds,
        {
          id: nid,
          type: 'data',
          position: nextNodePosition(nds),
          selected: true,
          data: defaultDataNodeData(nid, fieldKind),
        },
      ]);
      setSelectedId(nid);
      setAddOpen(false);
      setDropdownQuery('');
    },
    [setNodes]
  );

  const addAgentNode = useCallback(() => {
    const nid = `llm-${Date.now()}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: 'llm',
        position: nextNodePosition(nds),
        selected: true,
        data: defaultAgentData('llm', nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const addGuardrailsNode = useCallback(() => {
    const nid = `guardrails-${Date.now()}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: 'guardrails',
        position: nextNodePosition(nds),
        selected: true,
        data: defaultAgentData('guardrails', nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const addMcpNode = useCallback(() => {
    const nid = `mcp-${Date.now()}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: 'mcp',
        position: nextNodePosition(nds),
        selected: true,
        data: defaultAgentData('mcp', nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const addIfElseNode = useCallback(() => {
    const nid = `if_else-${Date.now()}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: 'if_else',
        position: nextNodePosition(nds),
        selected: true,
        data: defaultAgentData('if_else', nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const addEndNode = useCallback(() => {
    const nid = `end-${Date.now()}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: 'end',
        position: nextNodePosition(nds),
        selected: true,
        data: defaultAgentData('end', nid),
      },
    ]);
    setSelectedId(nid);
    setAddOpen(false);
    setDropdownQuery('');
  }, [setNodes]);

  const studioActions = useMemo(
    () => ({
      openApiInspector,
      addBlankApiNode,
      addDataListNode: () => addDataNode('list'),
      addAgentNode,
      addGuardrailsNode,
      addMcpNode,
      addIfElseNode,
      addEndNode,
    }),
    [openApiInspector, addBlankApiNode, addDataNode, addAgentNode, addGuardrailsNode, addMcpNode, addIfElseNode, addEndNode]
  );

  const exportFlow = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges, workflowName }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase() || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [nodes, edges, workflowName]);

  const importFlow = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const j = JSON.parse(String(reader.result));
          if (Array.isArray(j.nodes)) setNodes(j.nodes);
          if (Array.isArray(j.edges)) setEdges(normalizeWorkflowEdges(j.edges));
          if (typeof j.workflowName === 'string') setWorkflowName(j.workflowName);
          setSelectedId(null);
        } catch {
          setRunMessage('Invalid workflow file.');
          window.setTimeout(() => setRunMessage(null), 2500);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setEdges, setNodes]);

  const resetCanvas = useCallback(() => {
    setNodes(initialNodes);
    setEdges([]);
    setRunMessage(null);
    setRunLog(null);
    setSelectedId(null);
  }, [setEdges, setNodes]);

  const runWorkflow = useCallback(async () => {
    setRunBusy(true);
    setRunMessage(null);
    setRunLog(null);

    try {
      const startId = findStartNodeId(nodes);
      if (!startId) {
        setRunMessage('Canvas needs a Start node.');
        return;
      }

      const { order, error } = computeWorkflowRunOrder(startId, nodes, edges);
      if (error) {
        setRunMessage(error);
        return;
      }

      const stepRows: RunStep[] = order.map((nid) => {
        const node = nodes.find((n) => n.id === nid);
        if (!node) return { id: nid, kind: 'missing', title: '?', detail: 'Missing node' };
        const s = summarizeNode(node);
        return { id: s.id, kind: s.kind, title: s.title, detail: s.detail };
      });
      setRunLog(stepRows);

      let apiCount = 0;
      for (const nodeId of order) {
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (!node || node.type !== 'api') continue;

        const d = normalizeApiData({ ...((node.data || {}) as AgentNodeData) });
        const out = await runAgentApiRequest(d);

        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const prev = (n.data || {}) as AgentNodeData;
            return {
              ...n,
              data: normalizeApiData({
                ...prev,
                responseBodyJson: out.responseBodyJson,
                responseStatus: out.responseStatus,
              }),
            };
          })
        );

        nodesRef.current = nodesRef.current.map((n) => {
          if (n.id !== nodeId) return n;
          const prev = (n.data || {}) as AgentNodeData;
          return {
            ...n,
            data: normalizeApiData({
              ...prev,
              responseBodyJson: out.responseBodyJson,
              responseStatus: out.responseStatus,
            }),
          };
        });

        applyApiSuccessToConnectedListNodes({
          apiNodeId: nodeId,
          responseBodyJson: out.responseBodyJson,
          responseStatus: out.responseStatus,
          getEdges: () => edgesRef.current,
          setNodes,
        });
        apiCount++;
      }

      setRunMessage(
        apiCount > 0
          ? `Run complete: ${apiCount} API request(s). Responses pushed to connected Data Lists.`
          : `Run complete: ${order.length} step(s) — no API nodes on this path.`
      );
      window.setTimeout(() => setRunMessage(null), 6000);

      void studioFetch(apiUrl('/api/agent-studio/workflow/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getStudioAuthHeaders() },
        body: JSON.stringify({ workflowName, nodes: nodesRef.current, edges: edgesRef.current }),
      }).catch(() => {
        /* optional server log */
      });
    } catch (e) {
      setRunMessage(e instanceof Error ? e.message : 'Run failed.');
    } finally {
      setRunBusy(false);
    }
  }, [nodes, edges, workflowName, setNodes]);

  const saveAgentDraft = useCallback(async () => {
    try {
      localStorage.setItem(
        AGENT_STUDIO_STORAGE_KEY,
        JSON.stringify({
          workflowName,
          nodes,
          edges,
          savedAt: new Date().toISOString(),
        })
      );

      const headers = getStudioAuthHeaders();
      if (headers['x-user-email'] && agentKind) {
        const id = remoteDbAgentId ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const res = await studioFetch(apiUrl('/api/agents'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            id,
            name: workflowName.trim() || 'Untitled agent',
            visibility: 'private',
            updatedAt: Date.now(),
            payload: {
              agentKind,
              workflowName,
              nodes,
              edges,
            },
          }),
        });
        const j = (await readApiJson(res)) as { ok?: boolean; id?: string };
        if (res.ok && j?.ok !== false && j.id) {
          setRemoteDbAgentId(String(j.id));
          onSavedToDatabase?.();
        }
      }

      setSaveFeedback('Saved');
      window.setTimeout(() => setSaveFeedback(null), 2000);
    } catch {
      setSaveFeedback('Save failed');
      window.setTimeout(() => setSaveFeedback(null), 2500);
    }
  }, [workflowName, nodes, edges, agentKind, remoteDbAgentId, onSavedToDatabase]);

  const qNorm = dropdownQuery.trim().toLowerCase();
  const filteredAddMenuAgents = ADD_MENU_AGENTS.filter(
    (p) =>
      !qNorm || p.label.toLowerCase().includes(qNorm) || p.hint.toLowerCase().includes(qNorm)
  );
  const filteredAddMenuLogic = ADD_MENU_LOGIC.filter(
    (p) =>
      !qNorm ||
      p.label.toLowerCase().includes(qNorm) ||
      p.hint.toLowerCase().includes(qNorm)
  );
  const filteredAddMenuDataKinds = DATA_FIELD_KINDS.filter((kind) => {
    if (!qNorm) return true;
    const blob = `${DATA_FIELD_LABELS[kind]} ${DATA_FIELD_MENU_HINTS[kind]} data ${kind}`.toLowerCase();
    return blob.includes(qNorm);
  });

  const addMenuHasHits =
    filteredAddMenuAgents.length > 0 || filteredAddMenuLogic.length > 0 || filteredAddMenuDataKinds.length > 0;

  const flowClass = isDarkMode ? 'dark' : '';

  const barBg = isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white';
  const plusBtn = isDarkMode
    ? 'border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:border-slate-500'
    : 'border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-300';
  const nameInput = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 border-b ${barBg}`}>
        <div className="mx-auto flex w-full max-w-[440px] flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-4">
          {onBackToAgentType && (
            <button
              type="button"
              onClick={onBackToAgentType}
              title="Back to agent type"
              aria-label="Back to agent type"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isDarkMode
                  ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="relative shrink-0" ref={addMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAddOpen((v) => !v);
              }}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${plusBtn}`}
              title="Add node"
              aria-expanded={addOpen}
              aria-haspopup="menu"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </button>
            {addOpen && (
              <div
                className={`absolute left-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl border shadow-xl ${
                  isDarkMode ? 'border-slate-600 bg-slate-900' : 'border-slate-200 bg-white'
                }`}
                role="menu"
              >
                <div className={`border-b p-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                  <label className={`relative block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
                    <input
                      ref={dropdownSearchRef}
                      value={dropdownQuery}
                      onChange={(e) => setDropdownQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Search for blocks or requests"
                      className={`w-full rounded-lg border py-2 pl-8 pr-2 text-xs outline-none ${
                        isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`}
                    />
                  </label>
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {!addMenuHasHits ? (
                    <p className="px-3 py-2 text-center text-[11px] text-slate-500">No matches</p>
                  ) : (
                    <>
                      {filteredAddMenuAgents.map((p) => {
                        const Icon = p.Icon;
                        return (
                          <button
                            key={p.type}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              addNode(p.type);
                              setDropdownQuery('');
                            }}
                            className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
                              isDarkMode
                                ? 'text-slate-200 hover:bg-slate-800/80'
                                : 'text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${HEADER[p.type].bar}`}
                            >
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold">{p.label}</span>
                              <span className="text-[10px] font-normal leading-snug text-slate-500 dark:text-slate-400">
                                {p.hint}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                      {filteredAddMenuAgents.length > 0 && (filteredAddMenuLogic.length > 0 || filteredAddMenuDataKinds.length > 0) && (
                        <div
                          role="presentation"
                          className={`mx-3 my-1 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}
                        />
                      )}
                      {filteredAddMenuLogic.length > 0 && (
                        <>
                          <div className="px-3 pb-1 pt-1">
                            <p
                              className={`text-[10px] font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              Logic
                            </p>
                          </div>
                          {filteredAddMenuLogic.map((p) => {
                            const Icon = p.Icon;
                            return (
                              <button
                                key="if-or-else-logic"
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  addIfElseNode();
                                  setDropdownQuery('');
                                }}
                                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
                                  isDarkMode
                                    ? 'text-slate-200 hover:bg-slate-800/80'
                                    : 'text-slate-900 hover:bg-slate-100'
                                }`}
                              >
                                <span
                                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${HEADER.if_else.bar}`}
                                >
                                  <Icon className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-semibold">{p.label}</span>
                                  <span className="text-[10px] font-normal leading-snug text-slate-500 dark:text-slate-400">
                                    {p.hint}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </>
                      )}
                      {(filteredAddMenuAgents.length > 0 || filteredAddMenuLogic.length > 0) &&
                        filteredAddMenuDataKinds.length > 0 && (
                        <div
                          role="presentation"
                          className={`mx-3 my-1 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}
                        />
                      )}
                      {filteredAddMenuDataKinds.length > 0 && (
                        <>
                          <div className="px-3 pb-1 pt-1">
                            <p
                              className={`text-[10px] font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              Data
                            </p>
                          </div>
                          {filteredAddMenuDataKinds.map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                addDataNode(kind);
                                setDropdownQuery('');
                              }}
                              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
                                isDarkMode
                                  ? 'text-slate-200 hover:bg-slate-800/80'
                                  : 'text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              <DataPaletteGlyph kind={kind} />
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-900 dark:text-slate-100">
                                  {DATA_FIELD_LABELS[kind]}
                                </span>
                                <span className="text-[10px] font-normal leading-snug text-slate-500 dark:text-slate-400">
                                  {DATA_FIELD_MENU_HINTS[kind]}
                                </span>
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 basis-[12rem] items-center gap-1.5 sm:gap-2">
            <input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm font-semibold outline-none ring-violet-500/30 focus:ring-2 ${nameInput}`}
              placeholder="Name your agent"
              aria-label="Agent name"
            />
            <button
              type="button"
              onClick={saveAgentDraft}
              title="Save agent"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                isDarkMode
                  ? 'border-slate-600 bg-slate-900 text-sky-400 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-sky-600 shadow-sm hover:bg-slate-50'
              }`}
            >
              <Save className="h-5 w-5" />
            </button>
            {saveFeedback && (
              <span className="hidden text-[11px] font-medium text-emerald-600 dark:text-emerald-400 sm:inline">{saveFeedback}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const endId = resolveWorkflowEndChatTarget(nodes, selectedId);
              if (!endId) {
                setRunMessage('Add an End node (connected from Start), then open output chat.');
                window.setTimeout(() => setRunMessage(null), 5000);
                return;
              }
              setEndChatModalId(endId);
            }}
            title="Agent output chat"
            aria-label="Open agent output chat"
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Eye className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <AgentStudioActionsProvider value={studioActions}>
          <div
            className={`relative min-h-0 min-w-0 flex-1 ${flowClass} ${endChatModalId ? 'pointer-events-none select-none opacity-[0.55]' : ''}`}
          >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={!endChatModalId}
            nodesConnectable={!endChatModalId}
            elementsSelectable={!endChatModalId}
            panOnDrag={endChatModalId ? false : [1, 2]}
            zoomOnScroll={!endChatModalId}
            colorMode={isDarkMode ? 'dark' : 'light'}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: SOLID_EDGE_DEFAULTS.animated,
              style: { ...SOLID_EDGE_DEFAULTS.style },
            }}
            connectionLineStyle={{ strokeWidth: SOLID_EDGE_DEFAULTS.style.strokeWidth }}
            proOptions={{ hideAttribution: true }}
            className={isDarkMode ? 'bg-slate-950' : 'bg-slate-100'}
          >
            <Background variant={BackgroundVariant.Dots} gap={14} size={1} className={isDarkMode ? '!bg-slate-950' : '!bg-slate-100'} />
            <Controls
              className={`!m-2 !rounded-lg !border !shadow-md ${isDarkMode ? '!border-slate-700 !bg-slate-900' : '!border-slate-200 !bg-white'}`}
            />
            <MiniMap
              zoomable
              pannable
              nodeColor={(node) => minimapColorForFlowNode(node)}
              className={`!m-2 !rounded-lg !border !shadow-md ${isDarkMode ? '!border-slate-700 !bg-slate-900' : '!border-slate-200 !bg-white'}`}
            />
            {(runMessage || (runLog && runLog.length > 0)) && (
              <Panel position="top-center" className="mt-2 max-w-xl px-2">
                <div className="space-y-2">
                  {runMessage && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-center text-xs shadow-lg ${
                        isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      {runMessage}
                    </div>
                  )}
                  {runLog && runLog.length > 0 && (
                    <div
                      className={`max-h-40 overflow-y-auto rounded-lg border px-2 py-1.5 text-left text-[11px] shadow-lg ${
                        isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <p className="mb-1 px-1 font-semibold text-[10px] uppercase tracking-wide text-slate-500">Run order</p>
                      <ol className="list-decimal space-y-1 pl-5">
                        {runLog.map((s) => (
                          <li key={s.id}>
                            <span className="font-medium">{s.title}</span>
                            <span className="text-slate-500 dark:text-slate-400"> — {s.detail}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </ReactFlow>

          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[1] flex justify-center">
            <div
              className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-xl backdrop-blur ${
                isDarkMode ? 'border-slate-600 bg-slate-900/95' : 'border-slate-200 bg-white/95'
              }`}
            >
              <button
                type="button"
                title="Run entire workflow"
                disabled={runBusy}
                onClick={() => void runWorkflow()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {runBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current pl-0.5" />}
              </button>
              <div className={`mx-0.5 h-6 w-px ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
              <button
                type="button"
                title="Reset canvas"
                onClick={resetCanvas}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Import workflow"
                onClick={importFlow}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Export workflow"
                onClick={exportFlow}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
          </div>
        </AgentStudioActionsProvider>

        {selectedNode && (
          <aside
            className={`hidden w-[min(100%,440px)] shrink-0 flex-col border-l lg:flex ${
              isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
            }`}
          >
            <NodeInspector
              node={selectedNode}
              isDarkMode={isDarkMode}
              onPatch={patchSelectedNode}
              onDeselect={deselectNodes}
              syncApiSuccessToLists={syncApiSuccessToLists}
              onDeleteSelectedNode={deleteSelectedNode}
            />
          </aside>
        )}
      </div>

      <AgentEndChatModal
        isOpen={Boolean(endChatModalId)}
        isDarkMode={isDarkMode}
        workflowName={workflowName}
        endNodeId={endChatModalId ?? ''}
        nodes={nodes}
        edges={edges}
        onClose={() => setEndChatModalId(null)}
        setNodes={setNodes}
      />
    </div>
  );
};
