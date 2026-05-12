import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Pair fold start line index → closing line index (pretty-printed JSON). */
export function buildFoldMap(lines: string[]): Map<number, number> {
  const map = new Map<number, number>();
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const compact = trimmed.replace(/\s+/g, '');
    const opens = /[\{\[]\s*,?$/.test(trimmed);
    const closes = /^[\}\]]+(,?)$/.test(compact);

    if (opens && !closes) {
      stack.push(i);
    } else if (closes && stack.length > 0) {
      const openLine = stack.pop()!;
      map.set(openLine, i);
    }
  }

  return map;
}

function hiddenLineSet(collapsed: Set<number>, foldMap: Map<number, number>): Set<number> {
  const hidden = new Set<number>();
  for (const start of collapsed) {
    const end = foldMap.get(start);
    if (end === undefined) continue;
    for (let i = start + 1; i < end; i++) hidden.add(i);
  }
  return hidden;
}

type Theme = {
  bg: string;
  gutterText: string;
  gutterBg: string;
  guide: string;
  key: string;
  string: string;
  number: string;
  bool: string;
  nullLit: string;
  bracket: string;
  punct: string;
};

function postmanTheme(dark: boolean): Theme {
  return dark
    ? {
        bg: 'bg-[#1e1e1e]',
        gutterText: 'text-[#858585]',
        gutterBg: 'bg-[#252526]',
        guide: 'bg-[#404040]',
        key: 'text-[#ce9178]',
        string: 'text-[#9cdcfe]',
        number: 'text-[#b5cea8]',
        bool: 'font-semibold text-[#569cd6]',
        nullLit: 'font-semibold text-[#569cd6]',
        bracket: 'text-[#d4d4d4]',
        punct: 'text-[#d4d4d4]',
      }
    : {
        bg: 'bg-white',
        gutterText: 'text-[#737373]',
        gutterBg: 'bg-[#fafafa]',
        guide: 'bg-[#e8e8e8]',
        key: 'text-[#a31515]',
        string: 'text-[#0451a5]',
        number: 'text-[#098658]',
        bool: 'font-semibold text-[#0000c0]',
        nullLit: 'font-semibold text-[#0000c0]',
        bracket: 'text-[#242424]',
        punct: 'text-[#242424]',
      };
}

const TAB_PX = 14;

function highlightJsonLine(rest: string, th: Theme): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < rest.length) {
        if (rest[j] === '\\') {
          j += 2;
          continue;
        }
        if (rest[j] === '"') break;
        j++;
      }
      const tok = rest.slice(i, j + 1);
      const after = rest.slice(j + 1);
      const isKey = /^\s*:/.test(after);
      nodes.push(
        <span key={`${k++}`} className={isKey ? th.key : th.string}>
          {tok}
        </span>,
      );
      i = j + 1;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']') {
      nodes.push(
        <span key={`${k++}`} className={th.bracket}>
          {ch}
        </span>,
      );
      i++;
      continue;
    }
    if (ch === ':' || ch === ',') {
      nodes.push(
        <span key={`${k++}`} className={th.punct}>
          {ch}
        </span>,
      );
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      nodes.push(<span key={`${k++}`}>{ch}</span>);
      i++;
      continue;
    }
    const slice = rest.slice(i);
    const m = slice.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
    if (m) {
      const lit = m[0];
      const cls = lit === 'true' || lit === 'false' ? th.bool : lit === 'null' ? th.nullLit : th.number;
      nodes.push(
        <span key={`${k++}`} className={cls}>
          {lit}
        </span>,
      );
      i += lit.length;
      continue;
    }
    nodes.push(<span key={`${k++}`}>{ch}</span>);
    i++;
  }
  return nodes;
}

export type PostmanStyleJsonViewerProps = {
  text: string;
  isDarkMode: boolean;
  /** Fill remaining flex height (response panel). */
  fillHeight?: boolean;
  /** No outer border/radius (when wrapped in a framed card). */
  frameless?: boolean;
  className?: string;
  emptyHint?: string;
};

export function PostmanStyleJsonViewer({
  text,
  isDarkMode,
  fillHeight = false,
  frameless = false,
  className = '',
  emptyHint,
}: PostmanStyleJsonViewerProps) {
  const th = postmanTheme(isDarkMode);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  const prepared = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return { kind: 'empty' as const };
    try {
      const value = JSON.parse(trimmed) as unknown;
      const pretty = JSON.stringify(value, null, 2);
      const lines = pretty.split('\n');
      return { kind: 'json' as const, lines, foldMap: buildFoldMap(lines) };
    } catch {
      return { kind: 'invalid' as const, raw: text };
    }
  }, [text]);

  const toggleFold = (lineIdx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) next.delete(lineIdx);
      else next.add(lineIdx);
      return next;
    });
  };

  if (prepared.kind === 'empty') {
    return (
      <div
        className={`flex items-center justify-center rounded-md border px-3 py-8 font-mono text-[13px] leading-relaxed ${th.bg} ${
          isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-500'
        } ${fillHeight ? 'min-h-0 flex-1' : ''} ${className}`}
      >
        {emptyHint ?? '—'}
      </div>
    );
  }

  if (prepared.kind === 'invalid') {
    return (
      <pre
        className={`whitespace-pre-wrap break-all rounded-md border px-3 py-2 font-mono text-[13px] leading-relaxed ${
          isDarkMode ? 'border-slate-700 bg-[#1e1e1e] text-slate-300' : 'border-slate-200 bg-white text-slate-700'
        } ${fillHeight ? 'min-h-0 flex-1 overflow-auto' : ''} ${className}`}
      >
        {prepared.raw}
      </pre>
    );
  }

  const { lines, foldMap } = prepared;
  const hidden = hiddenLineSet(collapsed, foldMap);

  const outer = fillHeight
    ? `flex min-h-0 flex-1 flex-col overflow-hidden ${th.bg} ${className}`
    : frameless
      ? `flex max-h-full min-h-0 flex-1 flex-col overflow-hidden ${th.bg} ${className}`
      : `flex max-h-full flex-col overflow-hidden rounded-md border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'} ${th.bg} ${className}`;

  return (
    <div className={outer}>
      <div className={`min-h-0 flex-1 overflow-auto ${th.bg}`}>
        <div className="min-w-max pb-3 font-mono text-[13px] leading-[1.5]">
          {lines.map((line, idx) => {
            if (hidden.has(idx)) return null;
            const indentMatch = line.match(/^(\s*)/);
            const indentStr = indentMatch?.[1] ?? '';
            const indentSpaces = indentStr.length;
            const depth = Math.max(0, Math.floor(indentSpaces / 2));
            const rest = line.slice(indentStr.length);
            const hasFold = foldMap.has(idx);
            const isCollapsed = collapsed.has(idx);
            const foldEnd = foldMap.get(idx);

            return (
              <div key={idx} className={`flex min-h-[22px] ${isDarkMode ? 'selection:bg-[#264f78]' : 'selection:bg-[#add6ff]'}`}>
                <div
                  className={`w-11 shrink-0 select-none border-r text-right text-[12px] tabular-nums ${th.gutterBg} ${th.gutterText}`}
                  style={{ paddingRight: 8, paddingTop: 1 }}
                >
                  {idx + 1}
                </div>
                <div className={`flex min-w-0 flex-1 ${th.bg}`}>
                  <div className="flex w-6 shrink-0 items-start justify-center pt-0.5">
                    {hasFold ? (
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                        onClick={() => toggleFold(idx)}
                        className={`rounded p-0.5 ${isDarkMode ? 'text-[#c5c5c5] hover:bg-[#3c3c3c]' : 'text-[#616161] hover:bg-black/5'}`}
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />}
                      </button>
                    ) : (
                      <span className="inline-block w-3.5" />
                    )}
                  </div>
                  <div className="relative min-w-0 flex-1 pr-4">
                    {depth > 0 ? (
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 opacity-90"
                        style={{ width: depth * TAB_PX }}
                      >
                        {Array.from({ length: depth }, (_, g) => (
                          <div
                            key={g}
                            className={`absolute top-0 bottom-0 w-px ${th.guide}`}
                            style={{ left: (g + 1) * TAB_PX - 1 }}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className="relative whitespace-pre">
                      {indentStr ? <span className="select-none">{indentStr}</span> : null}
                      {highlightJsonLine(rest, th)}
                      {isCollapsed && foldEnd !== undefined ? (
                        <span className={`pl-1 ${isDarkMode ? 'text-[#858585]' : 'text-[#737373]'}`}>
                          … <span className={th.punct}>{lines[foldEnd]?.trim() ?? ''}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
