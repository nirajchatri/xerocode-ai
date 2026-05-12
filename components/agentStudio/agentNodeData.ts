/** Shared workflow node payload (serialised in workflow JSON). */

import type { SerializedGuardrails } from './guardrailsState';

export type ApiKeyValueRow = { key: string; value: string };

/** Query/body variables passed into the API call (canvas + inspector). */
export type ApiVariableRow = { name: string; valueType: string; value: string };

export type ApiAccent = 'sky' | 'blue' | 'violet' | 'emerald' | 'amber';

/** Common + extended HTTP verbs for API dropdowns. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'CONNECT', 'TRACE'] as const;

/** Data menu / Data node primitives (paired with workflow node type `'data'`). */
export const DATA_FIELD_KINDS = [
  'string',
  'number',
  'boolean',
  'decimal',
  'date',
  'time',
  'datetime',
  'list',
] as const;

export type DataFieldKind = (typeof DATA_FIELD_KINDS)[number];

/** Header bar color for Data List nodes (canvas + inspector chip). */
export type DataListBarAccent = 'emerald' | 'teal' | 'cyan' | 'violet' | 'amber' | 'rose';

export const DATA_FIELD_LABELS: Record<DataFieldKind, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  decimal: 'Decimal',
  date: 'Date',
  time: 'Time',
  datetime: 'Date and Time',
  list: 'Data List',
};

export const DATA_FIELD_MENU_HINTS: Record<DataFieldKind, string> = {
  string: 'Outputs a string of text',
  number: 'Outputs a numeric value',
  boolean: 'Outputs a true or false value',
  decimal: 'Outputs a decimal value',
  date: 'Outputs a specified date',
  time: 'Outputs a specified time',
  datetime: 'Outputs a specified date and time',
  list: 'Outputs a list of values',
};

export type DataListFieldMappingRow = {
  id: string;
  keyName: string;
  fieldPath: string;
};

/** One branch in an If / else node (Common Expression Language). */
export type IfElseBranchRow = {
  id: string;
  caseName: string;
  expression: string;
};

/** Tool row for Agent (LLM) workflow blocks. */
export type AgentToolRow = { id: string; name: string };

export type AgentOutputFormatId = 'text' | 'json' | 'markdown';

export type AgentNodeData = {
  nid?: string;
  subtitle?: string;
  /** Agent block (`llm`): model identifier. */
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  /** Agent node display name (inspector + run log). Node type stays `llm` in JSON for compatibility. */
  agentDisplayName?: string;
  /** When true, downstream execution may pass prior messages (best-effort stub). */
  agentIncludeChatHistory?: boolean;
  agentTools?: AgentToolRow[];
  agentOutputFormat?: AgentOutputFormatId;
  /** When output is JSON, optionally tag structured output / response schema intent. */
  agentResponseSchemaEnabled?: boolean;
  agentMaxTokens?: number;
  agentTopP?: number;
  agentChatkitDisplayResponse?: boolean;
  agentChatkitShowProgress?: boolean;
  agentChatkitShowSources?: boolean;
  agentContinueOnError?: boolean;
  agentWriteToHistory?: boolean;
  /** MCP-only connection (`mcp` node type). */
  serverUrl?: string;
  transport?: string;
  /** Preset from built-in catalog (e.g. gmail, box). `custom` or unset = generic. */
  mcpCatalogId?: string;
  /** User-defined server label (inspector + run detail). */
  mcpServerLabel?: string;
  mcpDescription?: string;
  mcpAuthType?: 'access_token';
  mcpAccessToken?: string;
  mcpBarAccent?: DataListBarAccent;
  /** Guardrails — structured checks (preferred). */
  guardrailsState?: SerializedGuardrails;
  /** Guardrails (`guardrails` node type) legacy free-text. */
  rulesText?: string;
  blockPii?: boolean;
  requireCitations?: boolean;
  /** API node — legacy single text block (migrated to rows) */
  headersText?: string;
  /** API */
  apiName?: string;
  method?: string;
  url?: string;
  apiHeaders?: ApiKeyValueRow[];
  apiQueryParams?: ApiKeyValueRow[];
  requestBodyJson?: string;
  responseBodyJson?: string;
  responseStatus?: number | null;
  /** @deprecated Prefer successMessageText; kept for older workflow JSON */
  outputMessagesText?: string;
  successMessageText?: string;
  errorMessageText?: string;
  apiVariables?: ApiVariableRow[];
  apiAccent?: ApiAccent;
  /** Data node — semantic field kind from the Data menu */
  dataFieldKind?: DataFieldKind;
  /** Serializable value for the field (`true`/`false` for boolean; list = one entry per line) */
  dataRawValue?: string;
  /** Optional display name shown in previews */
  dataNodeLabel?: string;
  /** Data List — rows of display key ↔ JSON path (see `normalizeDataListMappings`). */
  dataListFieldMappings?: DataListFieldMappingRow[];
  /** Sample JSON text for path autocomplete (set when API output is synced). */
  dataListSampleJson?: string;
  /** @deprecated Prefer `dataListFieldMappings`. */
  dataListKeyName?: string;
  /** @deprecated Prefer `dataListFieldMappings`. */
  dataListFieldPath?: string;
  /** Data List — show full response as collapsible JSON (ignore path rows). */
  dataListUseFullJson?: boolean;
  /** Data List — header bar accent (canvas). */
  dataListBarAccent?: DataListBarAccent;
  /** Agent (`llm`) — header bar accent on canvas. */
  agentBarAccent?: DataListBarAccent;
  /** Guardrails (`guardrails`) — header bar accent on canvas. */
  guardrailBarAccent?: DataListBarAccent;
  /** If / else (`if_else`) — ordered conditions; first is If, rest are Else if. */
  ifElseBranches?: IfElseBranchRow[];
  ifElseBarAccent?: DataListBarAccent;
  /** End (`end`) — user-facing label on canvas + chat runner. */
  endNodeLabel?: string;
  endBarAccent?: DataListBarAccent;
};

let mappingIdSeq = 0;
function nextMappingId(): string {
  mappingIdSeq += 1;
  return `dlm-${Date.now()}-${mappingIdSeq}`;
}

/** Rows for editors + API propagation (includes legacy single key/path migration). */
export function normalizeDataListMappings(d: Partial<AgentNodeData>): DataListFieldMappingRow[] {
  const rows = d.dataListFieldMappings;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((r) => ({
      id: typeof r?.id === 'string' && r.id ? r.id : nextMappingId(),
      keyName: String(r?.keyName ?? ''),
      fieldPath: String(r?.fieldPath ?? ''),
    }));
  }
  const kn = String(d.dataListKeyName ?? '').trim();
  const fp = String(d.dataListFieldPath ?? '').trim();
  if (kn || fp) {
    return [{ id: nextMappingId(), keyName: kn, fieldPath: fp }];
  }
  return [{ id: nextMappingId(), keyName: '', fieldPath: '' }];
}

export function emptyDataListMappingRow(): DataListFieldMappingRow {
  return { id: nextMappingId(), keyName: '', fieldPath: '' };
}

let ifElseBranchSeq = 0;
function nextIfElseBranchId(): string {
  ifElseBranchSeq += 1;
  return `ife-${Date.now()}-${ifElseBranchSeq}`;
}

export function emptyIfElseBranch(): IfElseBranchRow {
  return { id: nextIfElseBranchId(), caseName: '', expression: '' };
}

/** Default: one If + two Else if rows (matches typical branching setup). */
export function defaultIfElseBranches(): IfElseBranchRow[] {
  return [emptyIfElseBranch(), emptyIfElseBranch(), emptyIfElseBranch()];
}

export function normalizeIfElseBranches(d: Partial<AgentNodeData>): IfElseBranchRow[] {
  const rows = d.ifElseBranches;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((r) => ({
      id: typeof r?.id === 'string' && r.id ? r.id : nextIfElseBranchId(),
      caseName: String(r?.caseName ?? ''),
      expression: String(r?.expression ?? ''),
    }));
  }
  return defaultIfElseBranches();
}

let agentToolSeq = 0;
function nextAgentToolId(): string {
  agentToolSeq += 1;
  return `at-${Date.now()}-${agentToolSeq}`;
}

export function emptyAgentToolRow(): AgentToolRow {
  return { id: nextAgentToolId(), name: '' };
}

/** Default instructions for new Agent nodes — tone, usage, tools, and response. */
export const DEFAULT_AGENT_INSTRUCTIONS = `Describe how this model should behave:

• Tone — style and voice (e.g. professional, neutral, concise).

• Usage — when to answer directly, escalate, or refuse; any domain rules.

• Tools — how and when to call tools; required inputs and safeguards.

• Response — format, length, structure, and any citation or JSON requirements.`;

/** Placeholder label for the agent name field (no default value). */
export const AGENT_NAME_PLACEHOLDER = 'Agent Name';

export function normalizeAgentTools(d: Partial<AgentNodeData>): AgentToolRow[] {
  const rows = d.agentTools;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: typeof r?.id === 'string' && r.id ? r.id : nextAgentToolId(),
    name: String(r?.name ?? ''),
  }));
}

export const API_ACCENTS: Record<ApiAccent, { header: string; border: string; toolbar: string }> = {
  sky: {
    header: 'bg-sky-500',
    border: 'border-sky-200 dark:border-sky-700',
    toolbar: 'border-sky-200 bg-white dark:border-sky-800 dark:bg-slate-900',
  },
  blue: {
    header: 'bg-blue-600',
    border: 'border-blue-200 dark:border-blue-800',
    toolbar: 'border-blue-200 bg-white dark:border-blue-900 dark:bg-slate-900',
  },
  violet: {
    header: 'bg-violet-600',
    border: 'border-violet-200 dark:border-violet-800',
    toolbar: 'border-violet-200 bg-white dark:border-violet-900 dark:bg-slate-900',
  },
  emerald: {
    header: 'bg-emerald-600',
    border: 'border-emerald-200 dark:border-emerald-800',
    toolbar: 'border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900',
  },
  amber: {
    header: 'bg-amber-500',
    border: 'border-amber-200 dark:border-amber-700',
    toolbar: 'border-amber-200 bg-white dark:border-amber-900 dark:bg-slate-900',
  },
};

export function defaultApiNodeData(nid: string): AgentNodeData {
  return {
    nid,
    subtitle: 'REST / webhook caller',
    apiName: 'HTTP Request',
    method: 'GET',
    url: 'https://api.xerocode.ai/v1/sales',
    apiHeaders: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' },
    ],
    apiQueryParams: [{ key: '', value: '' }],
    requestBodyJson: '{\n  \n}',
    responseBodyJson: '',
    responseStatus: null,
    outputMessagesText: '',
    successMessageText: '',
    errorMessageText: '',
    apiVariables: [{ name: '', valueType: 'string', value: '' }],
    apiAccent: 'sky',
  };
}

/** Default empty value serialized as `dataRawValue` when adding a Data node from the palette. */
export function defaultDataRawForKind(kind: DataFieldKind): string {
  switch (kind) {
    case 'boolean':
      return 'false';
    case 'number':
      return '0';
    case 'decimal':
      return '0';
    case 'list':
      return '';
    default:
      return '';
  }
}

export function defaultDataNodeData(nid: string, kind: DataFieldKind): AgentNodeData {
  const label = DATA_FIELD_LABELS[kind];
  const base: AgentNodeData = {
    nid,
    subtitle: `Data · ${label}`,
    dataFieldKind: kind,
    dataRawValue: defaultDataRawForKind(kind),
    dataNodeLabel: '',
  };
  if (kind === 'list') {
    base.dataListFieldMappings = [emptyDataListMappingRow()];
    base.dataListUseFullJson = false;
    base.dataListBarAccent = 'emerald';
    base.dataListSampleJson = '';
  }
  return base;
}

export function blankApiNodeData(nid: string): AgentNodeData {
  return normalizeApiData({
    nid,
    subtitle: 'REST / webhook caller',
    apiName: 'New API',
    method: 'GET',
    url: '',
    apiHeaders: [{ key: '', value: '' }],
    apiQueryParams: [{ key: '', value: '' }],
    requestBodyJson: '{\n}',
    responseBodyJson: '',
    responseStatus: null,
    outputMessagesText: '',
    successMessageText: '',
    errorMessageText: '',
    apiVariables: [{ name: '', valueType: 'string', value: '' }],
    apiAccent: 'sky',
  });
}

/** Migrate legacy `headersText` into rows when present. */
export function normalizeApiData(d: AgentNodeData): AgentNodeData {
  let apiHeaders = d.apiHeaders?.length
    ? d.apiHeaders
    : parseHeadersText(d.headersText);
  if (!apiHeaders.length) apiHeaders = [{ key: '', value: '' }];

  const apiQueryParams =
    d.apiQueryParams?.length && d.apiQueryParams.some((r) => r.key || r.value)
      ? d.apiQueryParams
      : [{ key: '', value: '' }];

  const successMessageText =
    d.successMessageText != null && String(d.successMessageText).trim() !== ''
      ? d.successMessageText
      : (d.outputMessagesText?.trim() ? d.outputMessagesText : '');
  const errorMessageText = d.errorMessageText ?? '';

  let apiVariables: ApiVariableRow[];
  if (d.apiVariables?.length) {
    apiVariables = d.apiVariables.map((r) => ({
      name: r?.name ?? '',
      valueType: r?.valueType || 'string',
      value: r?.value ?? '',
    }));
  } else {
    apiVariables = [{ name: '', valueType: 'string', value: '' }];
  }

  return {
    ...d,
    apiName: d.apiName ?? 'HTTP Request',
    apiHeaders,
    apiQueryParams,
    requestBodyJson: d.requestBodyJson ?? '{\n  \n}',
    responseBodyJson: d.responseBodyJson ?? '',
    outputMessagesText: d.outputMessagesText ?? '',
    successMessageText,
    errorMessageText,
    apiVariables,
    apiAccent: d.apiAccent ?? 'sky',
  };
}

function parseHeadersText(raw?: string): ApiKeyValueRow[] {
  if (!raw?.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const out: ApiKeyValueRow[] = [];
  for (const line of lines) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
  }
  return out.length ? out : [];
}
