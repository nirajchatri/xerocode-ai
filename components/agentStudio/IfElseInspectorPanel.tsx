import React, { useCallback, useMemo } from 'react';
import { BookOpen, Trash2, X } from 'lucide-react';

import type { AgentNodeData, IfElseBranchRow } from './agentNodeData';
import { emptyIfElseBranch, normalizeIfElseBranches } from './agentNodeData';

const CEL_LANG_DOC = 'https://github.com/google/cel-spec/blob/master/doc/langdef.md';

function inputCls(isDark: boolean): string {
  return `w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
}

function textareaCls(isDark: boolean): string {
  return `${inputCls(isDark)} min-h-[4.25rem] resize-y font-mono text-[11px] leading-relaxed`;
}

export interface IfElseInspectorPanelProps {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
  onDeleteNode?: () => void;
  onClose?: () => void;
}

export function IfElseInspectorPanel({ data: d, isDarkMode, onPatch, onDeleteNode, onClose }: IfElseInspectorPanelProps) {
  const branches = useMemo(() => normalizeIfElseBranches(d), [d]);
  const ic = inputCls(isDarkMode);
  const tac = textareaCls(isDarkMode);
  const subtle = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const blockBg = isDarkMode ? 'bg-slate-950/50' : 'bg-slate-50';

  const setBranches = useCallback(
    (next: IfElseBranchRow[]) => {
      onPatch({ ifElseBranches: next });
    },
    [onPatch]
  );

  const updateBranch = useCallback(
    (id: string, patch: Partial<Pick<IfElseBranchRow, 'caseName' | 'expression'>>) => {
      setBranches(branches.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [branches, setBranches]
  );

  const removeBranch = useCallback(
    (id: string) => {
      if (branches.length <= 1) return;
      setBranches(branches.filter((b) => b.id !== id));
    },
    [branches, setBranches]
  );

  const addBranch = useCallback(() => {
    setBranches([...branches, emptyIfElseBranch()]);
  }, [branches, setBranches]);

  const hintRow = (
    <p className={`text-[11px] leading-relaxed ${subtle}`}>
      Use{' '}
      <span className="font-medium text-slate-700 dark:text-slate-300">Common Expression Language</span> to create a custom expression.{' '}
      <a href={CEL_LANG_DOC} target="_blank" rel="noopener noreferrer" className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400">
        Learn more
      </a>
      .
    </p>
  );

  return (
    <div className={`flex h-full min-h-0 flex-col ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <header className={`shrink-0 border-b px-3 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>If / else</h2>
            <p className={`mt-0.5 text-[11px] leading-snug ${subtle}`}>Create conditions to branch your workflow</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onClose ? (
              <button
                type="button"
                title="Close panel"
                onClick={onClose}
                className={`rounded-md p-1.5 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                aria-label="Close inspector"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <a
              href={CEL_LANG_DOC}
              target="_blank"
              rel="noopener noreferrer"
              title="CEL language reference"
              className={`rounded-md p-1.5 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
              aria-label="Open CEL documentation"
            >
              <BookOpen className="h-4 w-4" />
            </a>
            {onDeleteNode ? (
              <button
                type="button"
                title="Delete node"
                onClick={onDeleteNode}
                className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                aria-label="Delete If / else node"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {branches.map((row, index) => {
          const label = index === 0 ? 'If' : 'Else if';
          return (
            <div
              key={row.id}
              className={`relative rounded-xl border p-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'} ${blockBg}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${subtle}`}>{label}</span>
                <button
                  type="button"
                  title="Remove branch"
                  disabled={branches.length <= 1}
                  onClick={() => removeBranch(row.id)}
                  className={`rounded-md p-1 ${
                    branches.length <= 1
                      ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                      : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                  aria-label={`Remove ${label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <label className={`mb-2 block ${subtle}`}>
                <span className="sr-only">Case name</span>
                <input
                  value={row.caseName}
                  onChange={(e) => updateBranch(row.id, { caseName: e.target.value })}
                  placeholder="Case name (optional)"
                  className={ic}
                />
              </label>

              <label className={`block ${subtle}`}>
                <span className="sr-only">Expression</span>
                <textarea
                  value={row.expression}
                  onChange={(e) => updateBranch(row.id, { expression: e.target.value })}
                  placeholder='e.g. input.output_parsed.classification == "return_item"'
                  spellCheck={false}
                  className={tac}
                />
              </label>

              {index === 0 ? <div className="mt-2">{hintRow}</div> : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addBranch}
          className={`w-full rounded-lg border py-2.5 text-xs font-semibold transition-colors ${
            isDarkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-900' : 'border-slate-200 text-slate-800 hover:bg-slate-50'
          }`}
        >
          + Add
        </button>
      </div>
    </div>
  );
}
