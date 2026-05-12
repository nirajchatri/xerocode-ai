import React, { useMemo, useState } from 'react';
import type { Edge, Node as FlowNode } from '@xyflow/react';
import { ArrowLeft, Bot, Trash2, Workflow } from 'lucide-react';

import { AgentWorkflowCanvas } from './agentStudio/AgentWorkflowCanvas';

export type AgentPlatformKind = 'standalone' | 'managerial';

/** Row from GET /api/agents — payload carries the React Flow graph. */
export type SavedStudioAgentRow = {
  id: string;
  name: string;
  updatedAt: number;
  payload: {
    agentKind: AgentPlatformKind;
    workflowName: string;
    nodes: unknown[];
    edges: unknown[];
  };
};

type PlatformStep = 'choose' | 'studio';

export interface AgentPlatformScreenProps {
  isDarkMode: boolean;
  onBackToWorkspace: () => void;
  savedAgents?: SavedStudioAgentRow[];
  onDeleteSavedAgent?: (id: string) => void;
  onAgentsSaved?: () => void;
}

export const AgentPlatformScreen: React.FC<AgentPlatformScreenProps> = ({
  isDarkMode,
  onBackToWorkspace,
  savedAgents = [],
  onDeleteSavedAgent,
  onAgentsSaved,
}) => {
  const [step, setStep] = useState<PlatformStep>('choose');
  const [kind, setKind] = useState<AgentPlatformKind | null>(null);
  /** When set, the canvas loads this workflow instead of the local draft. */
  const [openedSaved, setOpenedSaved] = useState<SavedStudioAgentRow | null>(null);

  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardPick = (selected: boolean) =>
    `rounded-xl border p-4 text-left transition-all sm:p-5 ${
      selected
        ? isDarkMode
          ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/40'
          : 'border-violet-500 bg-violet-50 ring-1 ring-violet-200'
        : isDarkMode
          ? 'border-slate-800 hover:border-slate-600 hover:bg-slate-900'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
    }`;

  const startStudio = (next: AgentPlatformKind) => {
    setOpenedSaved(null);
    setKind(next);
    setStep('studio');
  };

  const openSavedRow = (row: SavedStudioAgentRow) => {
    const ak = row.payload?.agentKind === 'managerial' ? 'managerial' : 'standalone';
    setKind(ak);
    setOpenedSaved(row);
    setStep('studio');
  };

  const savedSnapshot = useMemo(() => {
    if (!openedSaved) return null;
    const nodes = Array.isArray(openedSaved.payload?.nodes) ? (openedSaved.payload.nodes as FlowNode[]) : [];
    const edges = Array.isArray(openedSaved.payload?.edges) ? (openedSaved.payload.edges as Edge[]) : [];
    const workflowName =
      typeof openedSaved.payload?.workflowName === 'string' && openedSaved.payload.workflowName.trim()
        ? openedSaved.payload.workflowName
        : openedSaved.name || 'Agent workflow';
    return {
      id: openedSaved.id,
      workflowName,
      nodes,
      edges,
    };
  }, [openedSaved]);

  const canvasKey = openedSaved?.id ?? `new-${kind ?? 'draft'}`;

  return (
    <div className={`flex h-full min-h-0 flex-col ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {step === 'choose' && (
        <header
          className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
            isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onBackToWorkspace()}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                isDarkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-900' : 'border-slate-200 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workspace
            </button>
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Build Your Agent</p>
              <p className={`truncate text-[11px] ${muted}`}>Choose how your agentic system should run</p>
            </div>
          </div>
        </header>
      )}

      {step === 'choose' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8">
            <h1 className={`text-center text-2xl font-bold sm:text-3xl ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              What are you building?
            </h1>
            <p className={`mx-auto mt-2 max-w-xl text-center text-sm ${muted}`}>
              Pick a model for your agentic AI stack, then use the playground to wire your workflow.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              <button type="button" onClick={() => startStudio('standalone')} className={cardPick(false)}>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/15 text-violet-500">
                  <Bot className="h-5 w-5" />
                </span>
                <p className={`mt-4 text-base font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  Single standalone agent
                </p>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                  One autonomous agent with tools and retrieval. Fast to ship, ideal for focused tasks and custom RAG.
                </p>
              </button>
              <button type="button" onClick={() => startStudio('managerial')} className={cardPick(false)}>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                  <Workflow className="h-5 w-5" />
                </span>
                <p className={`mt-4 text-base font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  Managerial agent (multi-agent system)
                </p>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
                  Orchestrates multiple agents along a predefined, structured path—best for repeatable processes. Create
                  individual agents first, then compose them into a fixed route.
                </p>
              </button>
            </div>

            <div className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <p className={`text-[10px] uppercase tracking-[0.16em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Agents you have saved
                </p>
              </div>
              {savedAgents.length === 0 ? (
                <div
                  className={`mx-auto mt-6 max-w-5xl rounded-xl border p-4 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  No saved agents yet. Create a workflow and choose Save in the playground.
                </div>
              ) : (
                <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2">
                  {savedAgents.map((row) => {
                    const kindLabel = row.payload?.agentKind === 'managerial' ? 'Managerial agent' : 'Standalone agent';
                    const KindIcon = row.payload?.agentKind === 'managerial' ? Workflow : Bot;
                    const when = row.updatedAt
                      ? new Date(row.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : '';
                    return (
                      <div
                        key={row.id}
                        className={`app-card-fade-in rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-0.5 ${
                          isDarkMode
                            ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openSavedRow(row)}
                            className="min-w-0 flex-1 text-left"
                            title={`Open ${row.name}`}
                          >
                            <div
                              className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                            >
                              <KindIcon className="h-3 w-3 shrink-0" aria-hidden />
                              <span>{kindLabel}</span>
                            </div>
                            <p
                              className={`mt-2 truncate text-[13px] font-semibold leading-5 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}
                            >
                              {row.name}
                            </p>
                            <p className={`mt-1 text-[12px] leading-5 ${muted}`}>{when ? `Updated ${when}` : 'Saved workflow'}</p>
                          </button>
                          {onDeleteSavedAgent && (
                            <button
                              type="button"
                              title="Delete saved agent"
                              aria-label="Delete saved agent"
                              onClick={(e) => {
                                e.preventDefault();
                                onDeleteSavedAgent(row.id);
                              }}
                              className="inline-flex shrink-0 items-center rounded p-1 text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentWorkflowCanvas
            key={canvasKey}
            isDarkMode={isDarkMode}
            agentKind={openedSaved?.payload?.agentKind === 'managerial' ? 'managerial' : openedSaved?.payload?.agentKind === 'standalone' ? 'standalone' : kind}
            savedAgentSnapshot={savedSnapshot}
            onSavedToDatabase={onAgentsSaved}
            onBackToAgentType={() => {
              setStep('choose');
              setKind(null);
              setOpenedSaved(null);
            }}
          />
        </div>
      )}
    </div>
  );
};
