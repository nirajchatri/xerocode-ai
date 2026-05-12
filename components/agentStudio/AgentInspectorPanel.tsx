import React, { useCallback, useId, useRef, useState } from 'react';
import { ChevronUp, Pencil, Plus } from 'lucide-react';

import type { AgentNodeData } from './agentNodeData';
import type { AgentOutputFormatId } from './agentNodeData';
import {
  AGENT_NAME_PLACEHOLDER,
  DEFAULT_AGENT_INSTRUCTIONS,
  emptyAgentToolRow,
  normalizeAgentTools,
  type AgentToolRow,
} from './agentNodeData';

export const AGENT_MODEL_OPTIONS = [
  'gpt-4.1-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-5',
  'o4-mini',
  'gpt-5-nano',
] as const;

const OUTPUT_OPTIONS: ReadonlyArray<{ id: AgentOutputFormatId; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
];

function inputBase(isDark: boolean): string {
  return `w-full rounded-md border px-2 py-1.5 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
}

function labelMuted(isDark: boolean): string {
  return isDark ? 'text-slate-500' : 'text-slate-500';
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  isDarkMode,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  isDarkMode: boolean;
}) {
  const display =
    Number.isInteger(step) || step >= 1
      ? String(Math.round(value))
      : value.toFixed(step >= 0.1 ? 2 : step >= 0.01 ? 2 : 3);
  return (
    <div className={`space-y-1 border-b pb-3 last:border-b-0 last:pb-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>{label}</span>
        <span className={`font-mono text-[11px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        className={`h-1.5 w-full cursor-pointer accent-violet-600 ${isDarkMode ? 'accent-violet-400' : ''}`}
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  isDarkMode,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  isDarkMode: boolean;
}) {
  const reactId = useId();
  const controlId = `toggle-${reactId.replace(/:/g, '')}`;
  const trackInactive = isDarkMode ? 'bg-slate-600' : 'bg-slate-300';

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label htmlFor={controlId} className={`cursor-pointer select-none text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
        {label}
      </label>
      <label htmlFor={controlId} className="relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-violet-500/55 focus-within:ring-offset-2 focus-within:ring-offset-transparent">
        <input
          id={controlId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className={`absolute inset-0 rounded-full transition-colors ${trackInactive} peer-checked:bg-violet-600`} />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 z-[1] h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out peer-checked:translate-x-[1.125rem]"
        />
      </label>
    </div>
  );
}

export interface AgentInspectorPanelProps {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
}

export function AgentInspectorPanel({ data: d, isDarkMode, onPatch }: AgentInspectorPanelProps) {
  const ic = inputBase(isDarkMode);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const [extraOpen, setExtraOpen] = useState(true);

  const tools = normalizeAgentTools(d);
  const setTools = useCallback((next: AgentToolRow[]) => onPatch({ agentTools: next }), [onPatch]);

  const patchToolName = useCallback(
    (id: string, name: string) => {
      setTools(tools.map((t) => (t.id === id ? { ...t, name } : t)));
    },
    [setTools, tools]
  );

  const removeTool = useCallback(
    (id: string) => setTools(tools.filter((x) => x.id !== id)),
    [setTools, tools]
  );

  const addTool = useCallback(() => setTools([...tools, emptyAgentToolRow()]), [setTools, tools]);

  const includeHistory = d.agentIncludeChatHistory !== false;
  const format: AgentOutputFormatId = (d.agentOutputFormat as AgentOutputFormatId) || 'json';
  const responseSchemaOn = Boolean(d.agentResponseSchemaEnabled);
  const temp = typeof d.temperature === 'number' ? d.temperature : 1;
  const maxTok = typeof d.agentMaxTokens === 'number' ? d.agentMaxTokens : 2048;
  const topP = typeof d.agentTopP === 'number' ? d.agentTopP : 1;
  const displayResponse = d.agentChatkitDisplayResponse !== false;
  const showProgress = d.agentChatkitShowProgress !== false;
  const showSources = d.agentChatkitShowSources !== false;
  const continueErr = Boolean(d.agentContinueOnError);
  const writeHistory = d.agentWriteToHistory !== false;

  const sub = labelMuted(isDarkMode);

  return (
    <div className="space-y-4 text-sm">
      <label className={`block ${sub}`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Agent name
        </span>
        <input
          value={String(d.agentDisplayName ?? '')}
          onChange={(e) => onPatch({ agentDisplayName: e.target.value })}
          className={ic}
          placeholder={AGENT_NAME_PLACEHOLDER}
        />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Instructions
          </span>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              title="Append guideline template"
              onClick={() =>
                onPatch({
                  systemPrompt: `${String(d.systemPrompt ?? '')}${String(d.systemPrompt ?? '').trim() ? '\n\n' : ''}${DEFAULT_AGENT_INSTRUCTIONS}`,
                })
              }
              className={`rounded-md p-1 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Focus instructions"
              onClick={() => instructionsRef.current?.focus()}
              className={`rounded-md p-1 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <textarea
          ref={instructionsRef}
          value={String(d.systemPrompt ?? '')}
          onChange={(e) => onPatch({ systemPrompt: e.target.value })}
          rows={6}
          placeholder={DEFAULT_AGENT_INSTRUCTIONS}
          spellCheck={false}
          className={`${ic} resize-y leading-relaxed ${isDarkMode ? 'bg-slate-900/80' : 'bg-slate-50'}`}
        />
      </div>

      <ToggleRow
        label="Include chat history"
        checked={includeHistory}
        onChange={(v) => onPatch({ agentIncludeChatHistory: v })}
        isDarkMode={isDarkMode}
      />

      <label className={`block ${sub}`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Model</span>
        <select value={String(d.model || 'gpt-4.1-mini')} onChange={(e) => onPatch({ model: e.target.value })} className={ic}>
          {AGENT_MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Tools
          </span>
          <button
            type="button"
            title="Add tool"
            onClick={addTool}
            className={`rounded-md p-1 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5">
          {tools.length === 0 && (
            <p className={`text-[11px] italic ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>No tools yet. Use + to add.</p>
          )}
          {tools.map((row) => (
            <div key={row.id} className="flex gap-1">
              <input
                value={row.name}
                onChange={(e) => patchToolName(row.id, e.target.value)}
                className={ic}
                placeholder="Tool name or reference"
              />
              <button
                type="button"
                title="Remove tool"
                onClick={() => removeTool(row.id)}
                className={`shrink-0 rounded-md px-2 text-xs ${isDarkMode ? 'text-rose-400 hover:bg-slate-800' : 'text-rose-600 hover:bg-rose-50'}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={`block ${sub}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Output format
          </span>
          <select
            value={format}
            onChange={(e) => onPatch({ agentOutputFormat: e.target.value as AgentOutputFormatId })}
            className={ic}
          >
            {OUTPUT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {format === 'json' && (
          <button
            type="button"
            onClick={() => onPatch({ agentResponseSchemaEnabled: !responseSchemaOn })}
            className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              responseSchemaOn
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/40'
                : isDarkMode
                  ? 'border-slate-600 text-slate-400 hover:bg-slate-800'
                  : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
            }`}
          >
            <span className={`font-mono text-[10px] ${isDarkMode ? 'text-violet-200' : 'text-violet-600'}`}>{'{Ξ}'}</span>
            response_schema
          </button>
        )}
      </div>

      <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
        <p className={`mb-3 text-[10px] font-bold uppercase tracking-wide ${sub}`}>Model parameters</p>
        <div className="space-y-3">
          <SliderRow
            label="Temperature"
            value={temp}
            min={0}
            max={2}
            step={0.01}
            onChange={(n) => onPatch({ temperature: n })}
            isDarkMode={isDarkMode}
          />
          <SliderRow
            label="Max tokens"
            value={maxTok}
            min={256}
            max={8192}
            step={64}
            onChange={(n) => onPatch({ agentMaxTokens: n })}
            isDarkMode={isDarkMode}
          />
          <SliderRow
            label="Top P"
            value={topP}
            min={0}
            max={1}
            step={0.01}
            onChange={(n) => onPatch({ agentTopP: n })}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>

      {extraOpen && (
        <>
          <div>
            <p className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${sub}`}>ChatKit</p>
            <div className={`divide-y rounded-lg border ${isDarkMode ? 'divide-slate-800 border-slate-700' : 'divide-slate-100 border-slate-200'}`}>
              <div className="px-2">
                <ToggleRow
                  label="Display response in chat"
                  checked={displayResponse}
                  onChange={(v) => onPatch({ agentChatkitDisplayResponse: v })}
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="px-2">
                <ToggleRow
                  label="Show in-progress messages"
                  checked={showProgress}
                  onChange={(v) => onPatch({ agentChatkitShowProgress: v })}
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="px-2">
                <ToggleRow
                  label="Show search sources"
                  checked={showSources}
                  onChange={(v) => onPatch({ agentChatkitShowSources: v })}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>

          <div>
            <p className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${sub}`}>Advanced</p>
            <div className={`divide-y rounded-lg border ${isDarkMode ? 'divide-slate-800 border-slate-700' : 'divide-slate-100 border-slate-200'}`}>
              <div className="px-2">
                <ToggleRow
                  label="Continue on error"
                  checked={continueErr}
                  onChange={(v) => onPatch({ agentContinueOnError: v })}
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="px-2">
                <ToggleRow
                  label="Write to conversation history"
                  checked={writeHistory}
                  onChange={(v) => onPatch({ agentWriteToHistory: v })}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <div className={`flex items-center justify-start border-t pt-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-xs font-semibold ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
          onClick={() => setExtraOpen((o) => !o)}
        >
          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${extraOpen ? '' : 'rotate-180'}`} />
          {extraOpen ? 'Less' : 'More'}
        </button>
      </div>
    </div>
  );
}
