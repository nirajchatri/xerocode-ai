import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const styles = {
  key: 'text-rose-900 dark:text-rose-200',
  str: 'text-blue-600 dark:text-blue-400',
  num: 'text-emerald-700 dark:text-emerald-400',
  bool: 'font-bold text-blue-900 dark:text-blue-300',
  nullish: 'text-slate-500',
  punct: 'text-slate-900 dark:text-slate-200',
};

function JsonScalar({ value, fit }: { value: unknown; fit: boolean }) {
  const wrap = fit ? 'text-[8px] leading-[1.25]' : 'text-[11px] leading-relaxed';
  if (value === null) return <span className={`${styles.nullish} ${wrap}`}>null</span>;
  if (typeof value === 'boolean') return <span className={`${styles.bool} ${wrap}`}>{String(value)}</span>;
  if (typeof value === 'number') return <span className={`${styles.num} ${wrap}`}>{value}</span>;
  if (typeof value === 'string') return <span className={`${styles.str} ${wrap}`}>&quot;{value}&quot;</span>;
  return <span className={`${styles.punct} ${wrap}`}>{String(value)}</span>;
}

const MAX_DEPTH = 26;

function JsonTreeInner({ value, depth, fit }: { value: unknown; depth: number; fit: boolean }) {
  const [open, setOpen] = useState(depth < 3);
  const ch = fit ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5';
  const indent = fit ? 'ml-2 border-l pl-1.5' : 'ml-4 border-l pl-2';

  if (value === null || typeof value !== 'object') {
    return <JsonScalar value={value} fit={fit} />;
  }

  if (depth >= MAX_DEPTH) {
    return <span className="text-[8px] text-amber-700 dark:text-amber-400">…</span>;
  }

  const isArr = Array.isArray(value);
  const obj = value as Record<string, unknown> | unknown[];
  const entries = isArr ? (obj as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(obj as Record<string, unknown>);

  return (
    <span className={`inline-flex flex-col items-start align-top ${fit ? 'text-[8px] leading-[1.25]' : 'text-[11px] leading-relaxed'}`}>
      <span className="inline-flex items-start gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className={`mt-0.5 shrink-0 rounded p-0 text-blue-600 hover:bg-slate-100 dark:text-blue-400 dark:hover:bg-slate-800`}
          aria-expanded={open}
        >
          {open ? <ChevronDown className={ch} /> : <ChevronRight className={ch} />}
        </button>
        <span>
          <span className={styles.punct}>{isArr ? '[' : '{'}</span>
          {!open && <span className={styles.punct}>{isArr ? ' … ]' : ' … }'}</span>}
        </span>
      </span>
      {open && (
        <div className={`${indent} border-slate-200 dark:border-slate-600`}>
          {entries.map(([k, v], idx) => (
            <div key={`${k}-${idx}`} className="block py-px">
              {isArr ? (
                <span>
                  <span className={styles.num}>{k}</span>
                  <span className={styles.punct}>: </span>
                  <JsonTreeInner value={v} depth={depth + 1} fit={fit} />
                </span>
              ) : (
                <span>
                  <span className={styles.key}>&quot;{k}&quot;</span>
                  <span className={styles.punct}>: </span>
                  <JsonTreeInner value={v} depth={depth + 1} fit={fit} />
                </span>
              )}
              {idx < entries.length - 1 && <span className={styles.punct}>,</span>}
            </div>
          ))}
          <span className={styles.punct}>{isArr ? ']' : '}'}</span>
        </div>
      )}
    </span>
  );
}

export interface CollapsibleJsonViewProps {
  jsonText: string;
  className?: string;
  /** Smaller typography and tighter layout to fit more JSON on screen. */
  size?: 'default' | 'fit';
  /** Shown when `jsonText` is empty. */
  emptyHint?: string;
}

export const CollapsibleJsonView: React.FC<CollapsibleJsonViewProps> = ({
  jsonText,
  className = '',
  size = 'default',
  emptyHint,
}) => {
  const fit = size === 'fit';

  const parsed = useMemo(() => {
    const t = String(jsonText ?? '').trim();
    if (!t) return { ok: true as const, data: null as unknown };
    try {
      return { ok: true as const, data: JSON.parse(t) as unknown };
    } catch {
      return { ok: false as const };
    }
  }, [jsonText]);

  const emptyTxt = fit ? 'text-[8px]' : 'text-[11px]';
  const errTxt = fit ? 'text-[8px]' : 'text-[11px]';

  if (!String(jsonText ?? '').trim()) {
    return (
      <p
        className={`rounded border border-dashed border-slate-200 bg-white px-2 py-3 text-center ${emptyTxt} text-slate-500 dark:border-slate-700 dark:bg-slate-950`}
      >
        {emptyHint ?? 'Run the request to see the response here.'}
      </p>
    );
  }

  if (!parsed.ok) {
    return (
      <pre
        className={`max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-mono ${errTxt} leading-snug text-red-600 dark:border-slate-700 dark:bg-slate-950 dark:text-red-400 ${className}`}
      >
        {String(jsonText)}
      </pre>
    );
  }

  return (
    <div
      className={`max-h-64 overflow-auto rounded border border-slate-200 bg-white px-1.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-950 ${fit ? '' : 'leading-relaxed'} ${className}`}
    >
      <JsonTreeInner value={parsed.data} depth={0} fit={fit} />
    </div>
  );
};
