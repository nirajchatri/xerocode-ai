import React from 'react';

import type { AgentNodeData } from './agentNodeData';

export interface EndInspectorPanelProps {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
}

export function EndInspectorPanel({ data: d, isDarkMode, onPatch }: EndInspectorPanelProps) {
  const ic = `w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${
    isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
  const lb = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="space-y-3 text-[13px]">
      <p className={`text-xs leading-relaxed ${lb}`}>
        Marks where the workflow delivers output. Open <span className="font-semibold">agent output chat</span> from the view (eye){' '}
        button next to Save in the studio header — prompts run upstream steps, then the Agent on this path replies in plain language.
      </p>
      <label className={`block ${lb}`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Display label</span>
        <input
          value={String(d.endNodeLabel ?? '')}
          onChange={(e) => onPatch({ endNodeLabel: e.target.value })}
          placeholder="End"
          className={ic}
        />
      </label>
    </div>
  );
}
