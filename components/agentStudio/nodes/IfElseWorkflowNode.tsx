import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeToolbar, Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Copy, GitBranch, Palette, Plus, Settings, Trash2 } from 'lucide-react';

import type { AgentNodeData } from '../agentNodeData';
import { normalizeIfElseBranches } from '../agentNodeData';
import { dataListBarClass, DATA_LIST_BAR_SWATCHES } from '../dataNodeAppearance';
import { useAgentStudioActions } from '../AgentStudioActionsContext';

const ifElseToolbarClass =
  'inline-flex w-max max-w-[calc(100vw-3rem)] flex-nowrap items-center justify-start gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900';

export function IfElseWorkflowNode({ id, data, selected }: NodeProps) {
  const { setNodes, setEdges, getNode } = useReactFlow();
  const studio = useAgentStudioActions();
  const d = (data || {}) as AgentNodeData;
  const bar = dataListBarClass(d.ifElseBarAccent ?? 'violet');
  const accent = d.ifElseBarAccent ?? 'violet';

  const branches = useMemo(() => normalizeIfElseBranches(d), [d]);
  const subtitle = useMemo(() => String(d.subtitle ?? '').trim(), [d.subtitle]);

  const nodeRef = useRef<HTMLDivElement>(null);
  const [menuHover, setMenuHover] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const onEnter = useCallback(() => {
    clearLeave();
    setMenuHover(true);
  }, [clearLeave]);

  const onLeave = useCallback(() => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setMenuHover(false), 200);
  }, [clearLeave]);

  useEffect(() => () => clearLeave(), [clearLeave]);

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

  const onDelete = useCallback(() => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, setEdges, setNodes]);

  const onDuplicate = useCallback(() => {
    const me = getNode(id);
    if (!me) return;
    const newId = `if_else-${Date.now()}`;
    const prev = (me.data || {}) as AgentNodeData;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        ...me,
        id: newId,
        position: { x: me.position.x + 48, y: me.position.y + 48 },
        selected: true,
        data: { ...prev, nid: newId },
      },
    ]);
  }, [id, getNode, setNodes]);

  return (
    <div ref={nodeRef} className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <NodeToolbar
        isVisible={Boolean(selected || menuHover)}
        position={Position.Top}
        offset={10}
        align="start"
        className="flex flex-col gap-1"
      >
        <div className={ifElseToolbarClass} onPointerDown={(e) => e.stopPropagation()} onMouseEnter={onEnter} onMouseLeave={onLeave}>
          <button
            type="button"
            title="Add If / else node"
            aria-label="Add If / else node"
            onClick={() => studio?.addIfElseNode()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-violet-500/45 bg-violet-500/10 text-violet-800 transition-colors hover:bg-violet-500/20 dark:border-violet-400/45 dark:text-violet-200 dark:hover:bg-violet-500/15"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>

          <button
            type="button"
            title="If / else settings — side panel"
            aria-label="If / else settings"
            onClick={() => studio?.openApiInspector(id)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              title="Bar color"
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
                      updateData({ ifElseBarAccent: key });
                      setPaletteOpen(false);
                    }}
                    className={`h-6 w-6 rounded-full ring-2 ring-offset-1 ring-offset-white ${header} ${
                      accent === key ? 'ring-blue-500' : 'ring-transparent'
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

      <div className="relative w-[min(calc(100vw-4rem),400px)] min-w-[280px] max-w-[400px] rounded-lg border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-900">
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />
        <div className={`flex items-center justify-between rounded-t-md px-2 py-1.5 text-[11px] font-bold text-white ${bar}`}>
          <span className="inline-flex min-w-0 items-center gap-1">
            <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">If / else</span>
          </span>
          <span className="shrink-0 rounded bg-white/20 px-1 text-[9px] font-mono">{String(d.nid ?? '').slice(-4)}</span>
        </div>
        <div className="space-y-1.5 p-2">
          {subtitle ? <p className="text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          <div className="max-h-[min(18rem,45vh)] space-y-1.5 overflow-y-auto pr-0.5">
            {branches.map((b, index) => {
              const limb = index === 0 ? 'If' : 'Else if';
              const caseNm = String(b.caseName ?? '').trim();
              const expr = String(b.expression ?? '').trim();
              const preview = expr || '—';
              return (
                <div
                  key={b.id}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
                >
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {limb}
                    {caseNm ? <span className="font-semibold normal-case text-slate-600 dark:text-slate-300"> · {caseNm}</span> : null}
                  </p>
                  <p className="mt-0.5 break-words font-mono text-[10px] leading-snug text-slate-800 dark:text-slate-200">{preview}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
