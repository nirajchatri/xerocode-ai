import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node as FlowNode } from '@xyflow/react';
import { FileDown, Loader2, MessageCircle, Send, X } from 'lucide-react';

import { apiUrl, studioFetch } from '../../lib/apiBase';
import { computeOrderFromStartToTarget, findStartNodeId } from '../../lib/workflowRunOrder.js';

import type { AgentNodeData } from './agentNodeData';
import { normalizeApiData } from './agentNodeData';
import { applyApiSuccessToConnectedListNodes, flattenJsonLeaves } from './apiListPropagation';
import { inferAgentLlmProvider } from './inferAgentLlmProvider';
import { runAgentApiRequest } from './apiRequestRunner';
import { downloadAgentChatPdf } from './agentChatPdfReport';
import { CHART_GRAPH_HELP, WorkflowChatMessageBody } from './WorkflowChatMessageBody';

export type ChatMsg = { role: 'user' | 'assistant'; text: string };

export interface AgentEndChatModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  workflowName: string;
  endNodeId: string;
  nodes: FlowNode[];
  edges: Edge[];
  onClose: () => void;
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
}

function clipText(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** Dashboard-designer-style readable facts — avoid shipping raw JSON blobs to the LLM. */
function buildReadableWorkflowFacts(order: string[], endId: string, nodeById: Map<string, FlowNode>): string {
  const blocks: string[] = [];
  const maxBlock = 5200;

  for (const nid of order) {
    if (nid === endId) break;
    const node = nodeById.get(nid);
    if (!node) continue;
    const d = (node.data || {}) as AgentNodeData;

    if (node.type === 'api') {
      const name = String(d.apiName || nid).trim();
      const status = d.responseStatus != null ? String(d.responseStatus) : '—';
      const body = String(d.responseBodyJson ?? '').trim();
      if (!body) {
        blocks.push(`• API "${name}" (HTTP ${status}): no response body captured yet.\n`);
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(body);
        const flat = flattenJsonLeaves(parsed);
        const lines = flat.split('\n').filter(Boolean).slice(0, 220);
        const bodyText =
          lines.length > 0
            ? `flattened fields (path:value lines):\n${lines.join('\n')}`
            : clipText(String(parsed), 2000);
        blocks.push(`• API "${name}" (HTTP ${status})\n${bodyText}\n`);
      } catch {
        blocks.push(`• API "${name}" (HTTP ${status}) — plain text excerpt:\n${clipText(body, 4000)}\n`);
      }
    }

    if (node.type === 'data') {
      const label = String(d.dataNodeLabel || 'Data field').trim();
      const kind = d.dataFieldKind || 'string';
      const raw = String(d.dataRawValue ?? '').trim();
      if (!raw) {
        blocks.push(`• Data "${label}" (${kind}): (empty).\n`);
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object') {
          const flat = flattenJsonLeaves(parsed);
          const lines = flat.split('\n').filter(Boolean).slice(0, 160);
          blocks.push(
            lines.length > 0
              ? `• Data "${label}" (${kind})\n${lines.join('\n')}\n`
              : `• Data "${label}" (${kind})\n(clipped snapshot)\n${clipText(JSON.stringify(parsed), 3500)}\n`
          );
        } else {
          blocks.push(`• Data "${label}" (${kind})\n${clipText(JSON.stringify(parsed), 3500)}\n`);
        }
      } catch {
        blocks.push(`• Data "${label}" (${kind})\n${clipText(raw, 4000)}\n`);
      }
    }
  }

  const joined = blocks.join('\n');
  return joined.length <= maxBlock ? joined : `${joined.slice(0, maxBlock)}\n…(facts truncated)`;
}

function transcriptForBundling(priorMsgs: ChatMsg[]): string {
  if (!priorMsgs.length) return '(no prior messages)';
  return priorMsgs.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n');
}

function dashboardStyleUserBundle(opts: {
  workflowName: string;
  readableFacts: string;
  transcriptPrior: ChatMsg[];
  latestUser: string;
}): string {
  return [
    '--- Agent workflow name ---',
    opts.workflowName.trim() || '(untitled)',
    '',
    '--- Facts from workflow execution (readable summaries; answers must be grounded here) ---',
    opts.readableFacts.trim() || '(no API or Data facts captured)',
    '',
    '--- Conversation so far ---',
    transcriptForBundling(opts.transcriptPrior),
    '',
    '--- Latest user message ---',
    opts.latestUser,
    '',
    'Answer in plain, professional language grounded in workflow facts above. Prefer insights, summaries, and clearly named fields; do not paste large raw JSON payloads in your reply unless the user asks for verbatim technical detail.',
    '',
    '--- Charts (optional; render in this chat UI) ---',
    CHART_GRAPH_HELP,
  ].join('\n');
}

export function AgentEndChatModal({
  isOpen,
  isDarkMode,
  workflowName,
  endNodeId,
  nodes,
  edges,
  onClose,
  setNodes,
}: AgentEndChatModalProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMsg[]>(messages);
  messagesRef.current = messages;
  /** Same workflow + End → keep transcript when modal closes; new graph context → fresh thread. */
  const chatContextKeyRef = useRef<string | null>(null);

  const welcomeMsg = useCallback((): ChatMsg => {
    const name = workflowName.trim() || 'Untitled agent';
    return {
      role: 'assistant',
      text: `Output chat for **${name}**. Each message runs upstream steps, then the Agent answers in plain language and can include **charts** (bar, line, area, pie) rendered in this panel when you ask for trends, breakdowns, or comparisons.`,
    };
  }, [workflowName]);

  useEffect(() => {
    if (!isOpen) return;
    setInput('');
    setError(null);

    const ctx = `${workflowName.trim()}|${endNodeId}`;
    if (chatContextKeyRef.current !== ctx) {
      chatContextKeyRef.current = ctx;
      setMessages([welcomeMsg()]);
    }
  }, [isOpen, workflowName, endNodeId, welcomeMsg]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [isOpen, messages]);

  const runTurn = useCallback(
    async (userText: string) => {
      const text = userText.trim();
      if (!text) return;

      const priorMsgs = [...messagesRef.current];

      setBusy(true);
      setError(null);
      setMessages((m) => [...m, { role: 'user', text }]);

      const startId = findStartNodeId(nodes);
      if (!startId) {
        setError('Add a Start node to the canvas.');
        setBusy(false);
        return;
      }

      const { order, error: pathErr } = computeOrderFromStartToTarget(startId, endNodeId, nodes, edges);
      if (pathErr || order.length === 0) {
        setError(pathErr || 'No steps on the path to this End.');
        setBusy(false);
        return;
      }

      let working = nodes.map((n) => ({ ...n, data: { ...(n.data as object) } }));

      const patchNode = (id: string, patch: Partial<AgentNodeData>) => {
        working = working.map((n) => {
          if (n.id !== id) return n;
          const prev = (n.data || {}) as AgentNodeData;
          return { ...n, data: { ...prev, ...patch } };
        });
        setNodes(() => working);
      };

      const setNodesForList = (updater: (prev: FlowNode[]) => FlowNode[]) => {
        working = updater(working);
        setNodes(() => working);
      };

      try {
        for (const nodeId of order) {
          const node = working.find((n) => n.id === nodeId);
          if (!node || node.id === endNodeId) continue;

          if (node.type === 'api') {
            const raw = (node.data || {}) as AgentNodeData;
            const d = normalizeApiData({ ...raw });
            const out = await runAgentApiRequest(d);
            patchNode(nodeId, {
              responseBodyJson: out.responseBodyJson,
              responseStatus: out.responseStatus,
            });
            applyApiSuccessToConnectedListNodes({
              apiNodeId: nodeId,
              responseBodyJson: out.responseBodyJson,
              responseStatus: out.responseStatus,
              getEdges: () => edges,
              setNodes: setNodesForList,
            });
          }
        }

        const nodeById = new Map(working.map((n) => [n.id, n]));
        const readableFacts = buildReadableWorkflowFacts(order, endNodeId, nodeById);

        let lastLlm: FlowNode | null = null;
        const endIx = order.indexOf(endNodeId);
        const slice = endIx >= 0 ? order.slice(0, endIx) : order;
        for (let i = slice.length - 1; i >= 0; i--) {
          const n = nodeById.get(slice[i]);
          if (n?.type === 'llm') {
            lastLlm = n;
            break;
          }
        }

        if (!lastLlm) {
          const summary =
            readableFacts.trim().length > 0
              ? `There is **no Agent (LLM) block** on this path yet. Readable workflow snapshot:\n\n${clipText(readableFacts, 5200)}`
              : 'Add an Agent node before End to get model answers.';
          setMessages((m) => [...m, { role: 'assistant', text: summary }]);
          setBusy(false);
          return;
        }

        const ld = (lastLlm.data || {}) as AgentNodeData;
        const model = String(ld.model || 'gpt-4.1-mini').trim();
        const provider = inferAgentLlmProvider(model);
        const agentSystem = String(ld.systemPrompt || '').trim() || 'You are a helpful assistant.';
        /** Conversational runner like dashboard compose — pipeline JSON toggle does not force API JSON replies here */
        const expectJson = false;
        const maxTokens =
          Number.isFinite(Number(ld.agentMaxTokens)) && Number(ld.agentMaxTokens) > 0
            ? Math.min(Math.max(Math.floor(Number(ld.agentMaxTokens)), 2048), 8192)
            : 6144;

        const displayName = String(ld.agentDisplayName || '').trim() || 'Agent';
        const bundledUser = dashboardStyleUserBundle({
          workflowName,
          readableFacts,
          transcriptPrior: priorMsgs,
          latestUser: text,
        });

        const basePrompt = [
          'You are answering in the Agent Studio output chat.',
          `Assigned agent slot: "${displayName}".`,
          'Ground replies in bundled workflow facts. Match the behavioral instructions passed as systemPrompt on the backend.',
          'Reply in concise natural language; avoid dumping raw JSON unless the user asks for verbatim technical payloads.',
          'When visuals help, follow "--- Charts ---" in the user bundle and emit valid ```chart JSON fences so graphs render in-app.',
        ].join(' ');

        const res = await studioFetch(apiUrl('/api/llm/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model,
            systemPrompt: agentSystem,
            userMessage: bundledUser,
            expectJson,
            maxTokens,
            dataSourceName: workflowName.trim() || 'Agent workflow',
            basePrompt,
            llmProviderLabel: provider,
            llmModelLabel: model,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; reply?: string; message?: string };
        if (!res.ok) {
          throw new Error(String(payload?.message || 'LLM request failed.'));
        }
        const reply = String(payload?.reply || '').trim() || 'No reply text returned.';
        setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Run failed.';
        setError(msg);
        setMessages((m) => [...m, { role: 'assistant', text: `**Error:** ${msg}` }]);
      } finally {
        setBusy(false);
      }
    },
    [edges, endNodeId, nodes, setNodes, workflowName]
  );

  const onSend = useCallback(() => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    void runTurn(t);
  }, [input, runTurn]);

  const onDownloadPdf = useCallback(async () => {
    setPdfExportBusy(true);
    try {
      await downloadAgentChatPdf({ workflowName, messages });
    } finally {
      setPdfExportBusy(false);
    }
  }, [workflowName, messages]);

  if (!isOpen) return null;

  const panel = isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900';
  const inputCls = isDarkMode
    ? 'border-slate-600 bg-slate-950 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400';

  return (
    <div
      className="fixed inset-0 z-[280] flex items-stretch justify-end bg-black/55 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-chat-title"
    >
      <div
        className={`flex h-full min-h-0 w-[50vw] min-w-[min(100%,20rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl ${panel}`}
      >
        <header className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDarkMode ? 'bg-teal-900/50 text-teal-200' : 'bg-teal-100 text-teal-800'}`}>
              <MessageCircle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="end-chat-title" className="truncate text-sm font-bold">
                Agent output
              </h2>
              <p className="truncate text-[11px] opacity-80">{workflowName.trim() || 'Untitled agent'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={busy || pdfExportBusy}
              onClick={() => void onDownloadPdf()}
              className={`rounded-lg p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 disabled:opacity-40' : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40'}`}
              title="Download PDF report"
              aria-label="Download PDF report"
            >
              {pdfExportBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className={`rounded-lg p-2 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 disabled:opacity-40' : 'text-slate-500 hover:bg-slate-100 disabled:opacity-40'}`}
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.map((msg, i) => (
            <div
              key={`${i}-${msg.role}-${msg.text.slice(0, 24)}`}
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? isDarkMode
                    ? `ml-auto max-w-[92%] bg-violet-900/40 text-slate-100`
                    : `ml-auto max-w-[92%] bg-violet-100 text-slate-900`
                  : isDarkMode
                    ? `mr-auto w-full max-w-full bg-slate-800 text-slate-100`
                    : `mr-auto w-full max-w-full bg-slate-100 text-slate-800`
              }`}
            >
              {msg.role === 'assistant' ? (
                <WorkflowChatMessageBody text={msg.text} isDarkMode={isDarkMode} parseCharts />
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              )}
            </div>
          ))}
          {busy ? (
            <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Running workflow and model…
            </div>
          ) : null}
        </div>

        {error ? (
          <p className={`shrink-0 px-4 pb-1 text-center text-[11px] text-red-600 dark:text-red-400`}>{error}</p>
        ) : null}

        <div className={`shrink-0 border-t p-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Ask in plain language…"
              className={`max-h-32 min-h-[2.75rem] flex-1 resize-y rounded-xl border px-3 py-2 text-sm outline-none ring-teal-500/20 focus:ring-2 disabled:opacity-50 ${inputCls}`}
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void onSend()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md transition hover:bg-teal-500 disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
