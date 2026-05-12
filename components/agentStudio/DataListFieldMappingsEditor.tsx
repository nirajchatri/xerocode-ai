import React, { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import type { DataListFieldMappingRow } from './agentNodeData';
import { emptyDataListMappingRow } from './agentNodeData';

function filterSuggestions(query: string, suggestions: string[], limit: number): string[] {
  const q = query.trim().toLowerCase();
  const pool = suggestions.filter(Boolean);
  if (!q) return pool.slice(0, limit);
  const scored = pool
    .map((s) => ({
      s,
      ok: s.toLowerCase().startsWith(q) ? 2 : s.toLowerCase().includes(q) ? 1 : 0,
    }))
    .filter((x) => x.ok > 0)
    .sort((a, b) => b.ok - a.ok || a.s.length - b.s.length)
    .map((x) => x.s);
  return scored.slice(0, limit);
}

export interface DataListFieldMappingsEditorProps {
  mappings: DataListFieldMappingRow[];
  onChange: (next: DataListFieldMappingRow[]) => void;
  pathSuggestions?: readonly string[];
  variant?: 'compact' | 'form';
  isDark?: boolean;
  disabled?: boolean;
}

export function DataListFieldMappingsEditor({
  mappings,
  onChange,
  pathSuggestions = [],
  variant = 'compact',
  isDark,
  disabled,
}: DataListFieldMappingsEditorProps) {
  const [openPathRowId, setOpenPathRowId] = useState<string | null>(null);

  const sugList = useMemo(() => [...pathSuggestions], [pathSuggestions]);

  const patchRow = useCallback(
    (id: string, patch: Partial<DataListFieldMappingRow>) => {
      onChange(mappings.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    },
    [mappings, onChange]
  );

  const removeRow = useCallback(
    (id: string) => {
      const next = mappings.filter((r) => r.id !== id);
      onChange(next.length ? next : [emptyDataListMappingRow()]);
    },
    [mappings, onChange]
  );

  const addRow = useCallback(() => {
    onChange([...mappings, emptyDataListMappingRow()]);
  }, [mappings, onChange]);

  const compactInput =
    isDark === true
      ? 'rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-100 placeholder:text-slate-500'
      : 'rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500';

  const formHeader = variant === 'form' ? (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      <span>Key Name</span>
      <span>Field Path</span>
      <span className="w-8" aria-hidden />
    </div>
  ) : null;

  return (
    <div className="space-y-2">
      {variant === 'form' && (
        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
          Configure how your list data should be processed.
        </p>
      )}
      <div className={`space-y-1.5 rounded-md ${variant === 'form' ? 'border border-slate-200 p-3 dark:border-slate-700' : ''}`}>
        {formHeader}
        <div className={`space-y-2 ${variant === 'compact' ? '-mx-0' : ''}`}>
          {mappings.map((row, idx) => {
            const sugOpen = openPathRowId === row.id;
            const filtered = sugOpen ? filterSuggestions(row.fieldPath, sugList, 14) : [];

            return (
              <div
                key={row.id}
                className={`grid gap-1 ${variant === 'form' ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'} items-start`}
              >
                <input
                  type="text"
                  disabled={disabled}
                  value={row.keyName}
                  placeholder={variant === 'form' ? 'Enter key name' : 'Key'}
                  onChange={(e) => patchRow(row.id, { keyName: e.target.value })}
                  className={`min-w-0 ${compactInput}`}
                  spellCheck={false}
                  aria-label={`Key name ${idx + 1}`}
                />
                <div className="relative min-w-0">
                  <input
                    type="text"
                    disabled={disabled}
                    autoComplete="off"
                    list={undefined}
                    value={row.fieldPath}
                    placeholder={variant === 'form' ? 'Enter field path (e.g., data.items.name)' : 'Path e.g. data[0].id'}
                    onFocus={() => setOpenPathRowId(row.id)}
                    onBlur={() => window.setTimeout(() => setOpenPathRowId((id) => (id === row.id ? null : id)), 120)}
                    onChange={(e) => patchRow(row.id, { fieldPath: e.target.value })}
                    className={`min-w-0 w-full ${compactInput} ${sugOpen ? 'border-blue-500 ring-1 ring-blue-400/40 dark:border-sky-400' : ''}`}
                    spellCheck={false}
                    aria-label={`Field path ${idx + 1}`}
                  />
                  {sugOpen && filtered.length > 0 && sugList.length > 0 && (
                    <ul
                      className="absolute left-0 top-full z-[70] mt-1 max-h-36 w-full overflow-y-auto rounded border border-slate-200 bg-white py-1 text-[10px] shadow-xl dark:border-slate-600 dark:bg-slate-900"
                      role="listbox"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {filtered.map((s) => (
                        <li key={`${row.id}-${s}`}>
                          <button
                            type="button"
                            role="option"
                            className="block w-full px-2 py-1 text-left font-mono text-[10px] text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                            onClick={() => {
                              patchRow(row.id, { fieldPath: s });
                              setOpenPathRowId(null);
                            }}
                          >
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 pt-0.5">
                  <button
                    type="button"
                    disabled={disabled}
                    title="Remove row"
                    onClick={() => removeRow(row.id)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    {variant === 'form' ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className={`flex w-full items-center justify-center gap-1 rounded border border-dashed py-1.5 text-[10px] font-semibold transition-colors ${
            isDark
              ? 'border-slate-600 text-sky-400 hover:bg-slate-800'
              : 'border-slate-300 text-blue-700 hover:bg-slate-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-slate-900'
          }`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add field path
        </button>
      </div>
    </div>
  );
}
