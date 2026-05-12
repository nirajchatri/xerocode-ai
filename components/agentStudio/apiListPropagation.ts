import type { Edge, Node } from '@xyflow/react';

import type { AgentNodeData, DataListFieldMappingRow } from './agentNodeData';
import { normalizeDataListMappings } from './agentNodeData';
import { getAtJsonPath } from './dataListPathUtils';

/** @deprecated Use getAtJsonPath from dataListPathUtils */
export function getAtPath(root: unknown, pathStr: string): unknown {
  return getAtJsonPath(root, pathStr);
}

function formatLeaf(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** One line per leaf: `path.to.value: serialized` */
export function flattenJsonLeaves(root: unknown): string {
  const lines: string[] = [];
  function walk(prefix: string, v: unknown) {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      lines.push(prefix ? `${prefix}: ${formatLeaf(v)}` : formatLeaf(v));
      return;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(prefix ? `${prefix}: []` : '[]');
        return;
      }
      v.forEach((item, i) => walk(prefix ? `${prefix}.${i}` : String(i), item));
      return;
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        lines.push(prefix ? `${prefix}: {}` : '{}');
        return;
      }
      for (const k of keys) {
        const p = prefix ? `${prefix}.${k}` : k;
        walk(p, (v as Record<string, unknown>)[k]);
      }
    }
  }
  walk('', root);
  return lines.join('\n');
}

export function extractedObjectFromMappings(
  parsed: unknown,
  mappings: DataListFieldMappingRow[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  mappings.forEach((row, i) => {
    const path = row.fieldPath.trim();
    let keyName = row.keyName.trim();
    if (!keyName && path) {
      const leaf = path.split(/[.[\]]+/).filter(Boolean).pop();
      keyName = leaf || `field_${i + 1}`;
    }
    if (!keyName) keyName = `field_${i + 1}`;
    if (!path) {
      out[keyName] = null;
      return;
    }
    const v = getAtJsonPath(parsed, path);
    out[keyName] = v === undefined ? null : (v as unknown);
  });
  return out;
}

/** Build `dataRawValue` JSON text for Data List storage + CollapsibleJsonView. */
export function buildDataListRawValueJson(
  parsed: unknown,
  d: Partial<AgentNodeData>
): string {
  if (d.dataListUseFullJson === true) {
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(parsed);
    }
  }
  const mappings = normalizeDataListMappings(d);
  const obj = extractedObjectFromMappings(parsed, mappings);
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return '{}';
  }
}

/** After editing mappings, refresh list output when `dataListSampleJson` is set. */
export function recomputeDataListDisplayIfSample(d: AgentNodeData): Pick<AgentNodeData, 'dataRawValue'> | null {
  const raw = String(d.dataListSampleJson ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { dataRawValue: buildDataListRawValueJson(parsed, d) };
  } catch {
    return null;
  }
}

/**
 * When an API node run succeeds, push response JSON into connected Data List nodes
 * (edges: API `api-success` → target `data` with `dataFieldKind === 'list'`).
 */
export function applyApiSuccessToConnectedListNodes(opts: {
  apiNodeId: string;
  responseBodyJson: string;
  responseStatus: number | null;
  getEdges: () => Edge[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
}): void {
  const { apiNodeId, responseBodyJson, getEdges, setNodes } = opts;

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(responseBodyJson || 'null'));
  } catch {
    return;
  }

  const edges = getEdges();
  const targetIds = new Set(
    edges
      .filter((e) => {
        if (e.source !== apiNodeId) return false;
        const h = e.sourceHandle;
        if (h === 'api-fail') return false;
        return h === 'api-success' || h == null || h === '';
      })
      .map((e) => e.target)
  );
  if (targetIds.size === 0) return;

  const sampleText = String(responseBodyJson ?? '');

  setNodes((nodes) =>
    nodes.map((node) => {
      if (!targetIds.has(node.id)) return node;
      const nod = node as Node & { data?: AgentNodeData };
      const d = (nod.data || {}) as AgentNodeData;
      if (nod.type !== 'data' || d.dataFieldKind !== 'list') return node;

      const raw = buildDataListRawValueJson(parsed, d);

      return {
        ...node,
        data: {
          ...d,
          dataRawValue: raw,
          dataListSampleJson: sampleText,
          dataListKeyName: '',
          dataListFieldPath: '',
        },
      };
    })
  );
}
