import React, { useMemo, useState } from 'react';
import {
  classifyVisualizationKind,
  collectProposalVisualizationRows,
  getProposalDashboardTitle,
  getProposalPreviewShell,
  visualizationRecordById,
  type ProposalVisualizationRow,
} from '../lib/dashboardDesignProposal';
import { deriveLiveBinding, type LiveVizBinding } from '../lib/designStudioLiveBindings';

export type DesignStudioLiveDataset = {
  rows: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  sourceLabel?: string;
};

export type DashboardProposalVisualPreviewProps = {
  proposal: Record<string, unknown>;
  isDarkMode?: boolean;
  embed?: boolean;
  /** Nested inside another bordered panel — drops outer frame and footer note */
  compact?: boolean;
  className?: string;
  /** When rows come from an executed saved/external API, charts and KPIs use live values. */
  liveDataset?: DesignStudioLiveDataset | null;
};

function VizCard({
  row,
  kind,
  isDarkMode,
  live,
}: {
  row: ProposalVisualizationRow;
  kind: ReturnType<typeof classifyVisualizationKind>;
  isDarkMode: boolean;
  live: LiveVizBinding | null;
}) {
  const shell =
    isDarkMode
      ? 'border border-slate-700/80 bg-slate-900/90 shadow-sm'
      : 'border border-slate-200 bg-white shadow-sm';

  if (kind === 'kpi') {
    const display = live?.kind === 'kpi' ? live.display : null;
    return (
      <div className={`rounded-xl p-4 ${shell}`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          {row.type}
        </p>
        <p className={`mt-1 text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
        {row.hint ? (
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{row.hint}</p>
        ) : null}
        <div className="mt-3 flex items-end gap-2">
          <div
            className={`h-10 flex-1 rounded-md ${isDarkMode ? 'bg-violet-500/25' : 'bg-violet-100'}`}
            aria-hidden
          />
          <span className={`text-2xl font-bold tabular-nums ${isDarkMode ? 'text-violet-300' : 'text-violet-700'}`}>
            {display ?? '—'}
          </span>
        </div>
      </div>
    );
  }

  if (kind === 'chart') {
    const chartLive = live?.kind === 'chart' ? live : null;
    const max =
      chartLive && chartLive.values.length > 0 ? Math.max(...chartLive.values.map((v) => Math.abs(v)), 1e-9) : 1;
    const heights =
      chartLive?.values.map((v) => `${Math.min(100, (Math.abs(v) / max) * 100)}%`) ??
      [42, 68, 55, 80, 58, 72, 64].map((h) => `${h}%`);
    return (
      <div className={`rounded-xl p-4 ${shell}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {row.type}
            </p>
            <p className={`truncate text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
            {row.hint ? (
              <p className={`mt-0.5 truncate text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{row.hint}</p>
            ) : null}
          </div>
        </div>
        <div
          className={`relative mt-4 h-36 overflow-hidden rounded-lg ${isDarkMode ? 'bg-slate-950/80' : 'bg-slate-50'}`}
        >
          <div className="absolute inset-x-3 bottom-8 top-5 flex items-end justify-between gap-1">
            {heights.map((h, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div
                  className={`w-[85%] max-w-[28px] rounded-t-sm ${isDarkMode ? 'bg-indigo-500/75' : 'bg-indigo-500/80'}`}
                  style={{ height: h }}
                  title={chartLive ? `${chartLive.labels[i] ?? ''}: ${chartLive.values[i]}` : undefined}
                />
              </div>
            ))}
          </div>
          {chartLive ? (
            <div
              className={`pointer-events-none absolute inset-x-2 bottom-1 flex justify-between gap-0.5 text-[9px] leading-tight ${
                isDarkMode ? 'text-slate-500' : 'text-slate-500'
              }`}
            >
              {chartLive.labels.map((lab, i) => (
                <span key={i} className="max-w-[3.5rem] flex-1 truncate text-center" title={lab}>
                  {lab}
                </span>
              ))}
            </div>
          ) : (
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-px ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}
              aria-hidden
            />
          )}
        </div>
      </div>
    );
  }

  if (kind === 'table') {
    const tbl = live?.kind === 'table' ? live : null;
    return (
      <div className={`rounded-xl p-4 ${shell}`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          {row.type}
        </p>
        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
        {tbl && tbl.columns.length > 0 ? (
          <div className={`mt-3 overflow-x-auto rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
            <table className="w-full min-w-[200px] text-left text-[11px]">
              <thead>
                <tr className={isDarkMode ? 'border-b border-slate-700 text-slate-400' : 'border-b border-slate-200 text-slate-600'}>
                  {tbl.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tbl.rows.map((r, ri) => (
                  <tr key={ri} className={isDarkMode ? 'border-t border-slate-800/80' : 'border-t border-slate-100'}>
                    {tbl.columns.map((c) => (
                      <td key={c} className={`max-w-[140px] truncate px-2 py-1.5 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {r[c] === null || r[c] === undefined ? '' : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`mt-3 space-y-2 rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-slate-50'} p-2`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <div className={`h-2 flex-[2] rounded ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
                <div className={`h-2 flex-1 rounded ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
                <div className={`h-2 w-10 rounded ${isDarkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'filter') {
    return (
      <div className={`rounded-xl p-4 ${shell}`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          Filter · {row.type}
        </p>
        <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
        <div
          className={`mt-3 h-9 rounded-lg border border-dashed ${isDarkMode ? 'border-slate-600 bg-slate-950/50' : 'border-slate-300 bg-white'}`}
        />
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-4 ${shell}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
        {row.type}
      </p>
      <p className={`mt-1 text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
      {row.hint ? (
        <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{row.hint}</p>
      ) : null}
      <div className={`mt-3 h-24 rounded-lg ${isDarkMode ? 'bg-slate-800/80' : 'bg-slate-100'}`} aria-hidden />
    </div>
  );
}

function vizCfg(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  const c = raw?.configuration;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
  return c as Record<string, unknown>;
}

function parseNameValueItems(cfg: Record<string, unknown>): { name: string; value: number }[] {
  const raw = cfg.items ?? cfg.series;
  if (!Array.isArray(raw)) return [];
  const out: { name: string; value: number }[] = [];
  raw.forEach((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return;
    const o = x as Record<string, unknown>;
    const name = String(o.name ?? o.label ?? o.category ?? '').trim() || '—';
    const value = typeof o.value === 'number' ? o.value : Number(o.value ?? o.amount ?? 0) || 0;
    out.push({ name, value });
  });
  return out;
}

function parseBarLabelValues(cfg: Record<string, unknown>): { label: string; value: number }[] {
  const raw = cfg.bar_series ?? cfg.weeks ?? cfg.items;
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: number }[] = [];
  raw.forEach((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return;
    const o = x as Record<string, unknown>;
    const label = String(o.label ?? o.week ?? o.name ?? o.day ?? '').trim() || '—';
    const value = typeof o.value === 'number' ? o.value : Number(o.value ?? o.amount ?? o.units ?? 0) || 0;
    out.push({ label, value });
  });
  return out;
}

function SalesDeltaPill({
  pct,
  direction,
  isDarkMode,
}: {
  pct: number;
  direction: string;
  isDarkMode: boolean;
}) {
  const down = direction === 'down';
  const cls = down
    ? isDarkMode
      ? 'bg-rose-950/80 text-rose-300'
      : 'bg-rose-50 text-rose-700'
    : isDarkMode
      ? 'bg-emerald-950/80 text-emerald-300'
      : 'bg-emerald-50 text-emerald-700';
  const sign = down ? '−' : '+';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>
      {sign}
      {Math.abs(pct)}%
    </span>
  );
}

function SalesAreaSvg({
  live,
  legendLabel,
}: {
  live: LiveVizBinding | null;
  legendLabel: string;
}) {
  const n = 29;
  let vals = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return 0.18 + 0.55 * Math.pow(Math.sin(t * Math.PI * 0.92), 1.15) + t * 0.28;
  });
  if (live?.kind === 'chart' && live.values.length >= 4) {
    const max = Math.max(...live.values.map((v) => Math.abs(v)), 1e-9);
    vals = live.values.slice(0, n).map((v) => Math.min(1, Math.abs(v) / max));
    while (vals.length < n) vals.push(vals[vals.length - 1] ?? 0.5);
  }
  const w = 640;
  const h = 220;
  const padL = 44;
  const padR = 16;
  const padT = 36;
  const padB = 36;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const step = iw / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => ({
    x: padL + i * step,
    y: padT + ih - Math.min(1, Math.max(0, v)) * ih,
  }));
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseY = padT + ih;
  const areaD =
    `M ${pts[0].x.toFixed(1)} ${baseY} ` +
    pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} Z`;
  const dayLabels = ['MAY 3', '', '', '', '', '', '', '', '', '', '', '', '', '', 'MAY 31'];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full max-h-52 text-violet-600" aria-hidden>
      <defs>
        <linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(139 92 246)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          x2={w - padR}
          y1={padT + ih * (1 - t)}
          y2={padT + ih * (1 - t)}
          stroke="currentColor"
          className="text-slate-200"
          strokeWidth="1"
          opacity={0.55}
        />
      ))}
      <path d={areaD} fill="url(#sales-area-fill)" />
      <path d={lineD} fill="none" stroke="rgb(109 40 217)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <text x={w - padR - 4} y={padT - 6} textAnchor="end" className="fill-slate-400 text-[10px] font-medium">
        <tspan className="fill-violet-600">●</tspan> {legendLabel}
      </text>
      <text x={padL - 6} y={padT + 4} textAnchor="end" className="fill-slate-400 text-[9px] font-medium">
        $600k
      </text>
      <text x={padL - 6} y={baseY} textAnchor="end" className="fill-slate-400 text-[9px] font-medium">
        $0k
      </text>
      {dayLabels.map((lab, i) =>
        lab ? (
          <text
            key={lab}
            x={padL + (i / (dayLabels.length - 1)) * iw}
            y={h - 10}
            textAnchor="middle"
            className="fill-slate-400 text-[9px] font-medium"
          >
            {lab}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function SalesLineSvg({ live, subtitle }: { live: LiveVizBinding | null; subtitle: string }) {
  const n = 14;
  let vals = [0.35, 0.42, 0.38, 0.52, 0.48, 0.61, 0.58, 0.72, 0.69, 0.78, 0.74, 0.85, 0.82, 0.88];
  if (live?.kind === 'chart' && live.values.length >= 4) {
    const max = Math.max(...live.values.map((v) => Math.abs(v)), 1e-9);
    vals = live.values.slice(0, n).map((v) => Math.min(1, Math.abs(v) / max));
    while (vals.length < n) vals.push(vals[vals.length - 1] ?? 0.5);
  }
  const w = 320;
  const h = 160;
  const padL = 28;
  const padR = 12;
  const padT = subtitle ? 28 : 16;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const step = iw / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => ({
    x: padL + i * step,
    y: padT + ih - Math.min(1, Math.max(0, v)) * ih,
  }));
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full max-h-40 text-violet-700" aria-hidden>
      {subtitle ? (
        <text x={padL} y={14} className="fill-slate-400 text-[9px] font-bold uppercase tracking-wide">
          {subtitle}
        </text>
      ) : null}
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          x2={w - padR}
          y1={padT + ih * (1 - t)}
          y2={padT + ih * (1 - t)}
          stroke="currentColor"
          className="text-slate-200"
          strokeWidth="1"
        />
      ))}
      <path d={lineD} fill="none" stroke="rgb(109 40 217)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="rgb(109 40 217)" />
      ))}
    </svg>
  );
}

function SalesPieSvg({
  items,
  donut,
  isDarkMode,
}: {
  items: { name: string; value: number }[];
  donut: boolean;
  isDarkMode: boolean;
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const cx = 84;
  const cy = 84;
  const rOuter = 72;
  const rInner = donut ? 44 : 0;
  const colors = ['#7c3aed', '#a78bfa', '#c4b5fd', '#8b5cf6', '#6d28d9', '#5b21b6'];

  const polar = (r: number, ang: number) => ({
    x: cx + r * Math.cos(ang),
    y: cy + r * Math.sin(ang),
  });

  let a0 = -Math.PI / 2;
  const arcs: { d: string; color: string }[] = [];

  items.forEach((it, idx) => {
    const sweep = (it.value / total) * 2 * Math.PI;
    const a1 = a0 + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const o0 = polar(rOuter, a0);
    const o1 = polar(rOuter, a1);
    let d: string;
    if (donut && rInner > 0) {
      const i1 = polar(rInner, a1);
      const i0 = polar(rInner, a0);
      d = [
        `M ${o0.x} ${o0.y}`,
        `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
        `L ${i1.x} ${i1.y}`,
        `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
        'Z',
      ].join(' ');
    } else {
      d = [`M ${cx} ${cy}`, `L ${o0.x} ${o0.y}`, `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`, 'Z'].join(' ');
    }
    arcs.push({ d, color: colors[idx % colors.length] });
    a0 = a1;
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 168 168" className="h-36 w-36 shrink-0" aria-hidden>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke={isDarkMode ? '#0f172a' : '#fff'} strokeWidth="1" />
        ))}
      </svg>
      <ul className={`min-w-0 flex-1 space-y-1.5 text-[11px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
        {items.map((it, idx) => (
          <li key={it.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
              <span className="truncate font-medium">{it.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">{Math.round((it.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SalesBarColumnSvg({
  items,
  live,
  isDarkMode,
}: {
  items: { label: string; value: number }[];
  live: LiveVizBinding | null;
  isDarkMode: boolean;
}) {
  let labels = items.map((i) => i.label);
  let vals = items.map((i) => i.value);
  if (live?.kind === 'chart' && live.values.length > 0) {
    vals = live.values.map((v) => Math.abs(v));
    labels = live.labels.length === vals.length ? live.labels : labels.slice(0, vals.length);
    while (labels.length < vals.length) labels.push(String(labels.length + 1));
  }
  const max = Math.max(...vals, 1);
  const barMaxPx = 112;
  return (
    <div className="flex h-40 items-end justify-between gap-2 px-1 pt-6">
      {vals.map((v, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <div
            className={`w-[78%] max-w-[40px] rounded-t-md ${isDarkMode ? 'bg-violet-500/85' : 'bg-violet-600'}`}
            style={{ height: `${Math.max(10, (v / max) * barMaxPx)}px` }}
            title={`${labels[i] ?? i}: ${v}`}
          />
          <span className={`max-w-full truncate text-center text-[9px] font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {labels[i] ?? i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

function SalesPaginatedTable({
  cols,
  rows,
  pageSize,
  isDarkMode,
}: {
  cols: string[];
  rows: Record<string, unknown>[];
  pageSize: number;
  isDarkMode: boolean;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages - 1);
  const slice = rows.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);

  const navBtn =
    `rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ` +
    (isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40' : 'border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40');

  return (
    <>
      <div className={`overflow-x-auto rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className={isDarkMode ? 'border-b border-slate-700 text-slate-400' : 'border-b border-slate-200 text-slate-500'}>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, ri) => (
              <tr key={ri} className={isDarkMode ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                {cols.map((c) => (
                  <td key={c} className={`px-3 py-2 font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    {r[c] == null ? '' : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize ? (
        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          <span>
            Page {pageSafe + 1} of {totalPages} · {rows.length} rows
          </span>
          <div className="flex gap-1">
            <button type="button" className={navBtn} disabled={pageSafe <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </button>
            <button
              type="button"
              className={navBtn}
              disabled={pageSafe >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SalesPerformanceLayout({
  title,
  objective,
  rows,
  vizById,
  liveById,
  liveDataset,
  isDarkMode,
  embed,
  compact,
  className,
}: {
  title: string;
  objective: string;
  rows: ProposalVisualizationRow[];
  vizById: Map<string, Record<string, unknown>>;
  liveById: Map<string, LiveVizBinding | null>;
  liveDataset: DesignStudioLiveDataset | null;
  isDarkMode: boolean;
  embed: boolean;
  compact: boolean;
  className: string;
}) {
  const kpis = rows.filter((r) => classifyVisualizationKind(r.type) === 'kpi');
  const charts = rows.filter((r) => classifyVisualizationKind(r.type) === 'chart');
  const tables = rows.filter((r) => classifyVisualizationKind(r.type) === 'table');

  const leaderboards = charts.filter((c) => /\bleaderboard\b/i.test(c.type));
  const heroAreaCharts = charts.filter((c) => {
    const t = c.type.toLowerCase();
    if (/\bleaderboard\b/.test(t)) return false;
    if (/\b(line_chart|sparkline)\b/.test(t)) return false;
    if (/\b(pie_chart|donut_chart)\b/.test(t)) return false;
    if (/\b(bar_chart|column_chart|vertical_bar)\b/.test(t)) return false;
    return /\b(area|multi_series)/i.test(t);
  });
  const lineCharts = charts.filter((c) => /\b(line_chart|sparkline)\b/i.test(c.type));
  const pieCharts = charts.filter((c) => /\b(pie_chart|donut_chart)\b/i.test(c.type));
  const barCharts = charts.filter((c) => /\b(bar_chart|column_chart|vertical_bar)\b/i.test(c.type));

  const chartAssigned = new Set([
    ...heroAreaCharts.map((c) => c.id),
    ...leaderboards.map((c) => c.id),
    ...lineCharts.map((c) => c.id),
    ...pieCharts.map((c) => c.id),
    ...barCharts.map((c) => c.id),
  ]);
  const remainingCharts = charts.filter((c) => !chartAssigned.has(c.id));

  const outer =
    compact || embed
      ? isDarkMode
        ? 'min-h-0 bg-slate-950 text-slate-100'
        : 'min-h-0 bg-[#f8f9fa] text-slate-900'
      : isDarkMode
        ? 'min-h-0 rounded-2xl border border-slate-800 bg-slate-950 text-slate-100'
        : 'min-h-0 rounded-2xl border border-slate-200 bg-[#f8f9fa] text-slate-900 shadow-sm';

  const card = isDarkMode ? 'rounded-xl border border-slate-700 bg-slate-900/95' : 'rounded-xl border border-slate-200 bg-white';

  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const timeframe = ['Last 7 Days', 'Monthly View', 'Year to Date'];

  const renderTable = (row: ProposalVisualizationRow) => {
    const raw = vizById.get(row.id);
    const cfg = vizCfg(raw);
    const colsCfg = Array.isArray(cfg.columns) ? (cfg.columns as unknown[]).map((c) => String(c)) : [];
    const previewRows = Array.isArray(cfg.preview_rows) ? (cfg.preview_rows as Record<string, unknown>[]) : [];
    const live = liveById.get(row.id);
    const effectiveCols = live?.kind === 'table' && live.columns.length > 0 ? live.columns : colsCfg;
    const effectiveRows = live?.kind === 'table' && live.rows.length > 0 ? live.rows : previewRows;
    let pageSize = Math.min(50, Math.max(1, Number(cfg.page_size) || 4));
    if (cfg.paging === false) pageSize = Math.max(effectiveRows.length, 1);

    return (
      <div key={row.id} className={`p-4 ${card}`}>
        <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>{row.title}</p>
        {effectiveCols.length === 0 || effectiveRows.length === 0 ? (
          <p className={`mt-3 text-xs ${muted}`}>Connect live data to populate this table.</p>
        ) : (
          <div className="mt-3">
            <SalesPaginatedTable
              key={`${row.id}-${effectiveRows.length}-${effectiveCols.join(',')}`}
              cols={effectiveCols}
              rows={effectiveRows}
              pageSize={pageSize}
              isDarkMode={isDarkMode}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${outer} ${compact ? 'p-3' : embed ? 'p-3' : 'p-5'} ${className}`}>
      {liveDataset?.loading ? (
        <p className={`mb-2 text-[11px] font-medium ${isDarkMode ? 'text-sky-300' : 'text-sky-700'}`}>Fetching API data for preview…</p>
      ) : null}
      {liveDataset?.error ? (
        <p
          className={`mb-2 rounded-lg border px-2 py-1.5 text-[11px] ${isDarkMode ? 'border-amber-500/35 bg-amber-950/40 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          {liveDataset.error}
        </p>
      ) : null}

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>{title}</h2>
          {objective ? <p className={`mt-1 text-sm ${muted}`}>{objective}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex rounded-lg border p-0.5 text-[11px] font-semibold ${isDarkMode ? 'border-slate-600 bg-slate-900' : 'border-slate-200 bg-white'}`}
          >
            {timeframe.map((label, i) => (
              <span
                key={label}
                className={`rounded-md px-3 py-1.5 ${
                  i === 1
                    ? isDarkMode
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-800 text-white'
                    : isDarkMode
                      ? 'text-slate-400'
                      : 'text-slate-600'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide ${isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            <span className={muted}>Range</span>
            <span className="normal-case">01/05/2025</span>
            <span className={muted}>→</span>
            <span className="normal-case">31/05/2025</span>
          </div>
        </div>
      </header>

      {kpis.length > 0 ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((row) => {
            const raw = vizById.get(row.id);
            const cfg = vizCfg(raw);
            const live = liveById.get(row.id) ?? null;
            const label = String(cfg.label || row.title).toUpperCase();
            const deltaPct = typeof cfg.delta_pct === 'number' ? cfg.delta_pct : null;
            const deltaDir = String(cfg.delta_direction || 'up');
            const fmt = String(cfg.format || '');
            const previewVal = cfg.preview_value != null ? String(cfg.preview_value) : null;

            let display: string | null = live?.kind === 'kpi' ? live.display : previewVal;

            if (fmt === 'category_highlight') {
              const cat = String(cfg.category_name || '—');
              const sub = cfg.preview_subvalue != null ? String(cfg.preview_subvalue) : '';
              return (
                <div key={row.id} className={`p-4 ${card}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{label}</p>
                  <p className={`mt-2 text-lg font-bold ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>{cat}</p>
                  {sub ? <p className={`mt-0.5 text-sm font-semibold tabular-nums ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{sub}</p> : null}
                  {deltaPct != null ? (
                    <div className="mt-2">
                      <SalesDeltaPill pct={deltaPct} direction={deltaDir} isDarkMode={isDarkMode} />
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <div key={row.id} className={`p-4 ${card}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{label}</p>
                <p className={`mt-3 text-2xl font-bold tabular-nums ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>
                  {display ?? '—'}
                </p>
                {deltaPct != null ? (
                  <div className="mt-2">
                    <SalesDeltaPill pct={deltaPct} direction={deltaDir} isDarkMode={isDarkMode} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {(heroAreaCharts.length > 0 || leaderboards.length > 0 || remainingCharts.length > 0) && (
        <section className="mb-6 grid gap-3 lg:grid-cols-3">
          {(heroAreaCharts[0] ? [heroAreaCharts[0]] : []).map((row) => {
            const raw = vizById.get(row.id);
            const cfg = vizCfg(raw);
            const live = liveById.get(row.id) ?? null;
            const subtitle = String(cfg.subtitle || '');
            const legend = String(cfg.legend || 'CURRENT');
            return (
              <div key={row.id} className={`p-4 lg:col-span-2 ${card}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>{subtitle}</p>
                    <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
                  </div>
                </div>
                <div className={`relative mt-2 rounded-lg ${isDarkMode ? 'bg-slate-950/60' : 'bg-slate-50/80'}`}>
                  <SalesAreaSvg live={live} legendLabel={legend} />
                </div>
              </div>
            );
          })}
          {leaderboards.map((row) => {
            const raw = vizById.get(row.id);
            const cfg = vizCfg(raw);
            const subtitle = String(cfg.subtitle || '');
            const itemsRaw = cfg.items;
            const items: { name: string; value: number }[] = Array.isArray(itemsRaw)
              ? (itemsRaw as Record<string, unknown>[]).map((it) => ({
                  name: String(it.name ?? '—'),
                  value: typeof it.value === 'number' ? it.value : Number(it.value) || 0,
                }))
              : [];
            const maxVal = items.length ? Math.max(...items.map((i) => i.value), 1) : 1;

            return (
              <div key={row.id} className={`p-4 lg:col-span-1 ${card}`}>
                <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>{subtitle}</p>
                <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{row.title}</p>
                <ul className="mt-4 space-y-3">
                  {items.map((it) => (
                    <li key={it.name}>
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <span className={`flex items-center gap-2 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                          >
                            ◆
                          </span>
                          {it.name.toUpperCase()}
                        </span>
                        <span className={`tabular-nums font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          ${it.value.toLocaleString()}
                        </span>
                      </div>
                      <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div
                          className="h-full rounded-full bg-violet-600"
                          style={{ width: `${Math.round((it.value / maxVal) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {remainingCharts.map((row) => (
            <VizCard key={row.id} row={row} kind="chart" isDarkMode={isDarkMode} live={liveById.get(row.id) ?? null} />
          ))}
        </section>
      )}

      {(pieCharts[0] || barCharts[0] || lineCharts[0]) && (
        <section
          className={`mb-6 grid gap-3 ${[pieCharts[0], barCharts[0], lineCharts[0]].filter(Boolean).length >= 3 ? 'lg:grid-cols-3' : [pieCharts[0], barCharts[0], lineCharts[0]].filter(Boolean).length === 2 ? 'md:grid-cols-2' : ''}`}
        >
          {pieCharts[0] ? (
            <div className={`p-4 ${card}`}>
              {(() => {
                const raw = vizById.get(pieCharts[0].id);
                const cfg = vizCfg(raw);
                const items = parseNameValueItems(cfg);
                const donut = /\bdonut/i.test(pieCharts[0].type);
                return (
                  <>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>
                      {String(cfg.subtitle || 'REVENUE MIX')}
                    </p>
                    <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{pieCharts[0].title}</p>
                    <div className="mt-3">
                      <SalesPieSvg
                        items={items.length ? items : [
                          { name: 'Blazers', value: 42 },
                          { name: 'Jeans', value: 28 },
                          { name: 'Other', value: 30 },
                        ]}
                        donut={donut}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}
          {barCharts[0] ? (
            <div className={`p-4 ${card}`}>
              {(() => {
                const raw = vizById.get(barCharts[0].id);
                const cfg = vizCfg(raw);
                const bars = parseBarLabelValues(cfg);
                const live = liveById.get(barCharts[0].id) ?? null;
                return (
                  <>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>
                      {String(cfg.subtitle || 'BY WEEK')}
                    </p>
                    <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{barCharts[0].title}</p>
                    <SalesBarColumnSvg
                      items={
                        bars.length
                          ? bars
                          : [
                              { label: 'W1', value: 42 },
                              { label: 'W2', value: 58 },
                              { label: 'W3', value: 51 },
                              { label: 'W4', value: 73 },
                            ]
                      }
                      live={live}
                      isDarkMode={isDarkMode}
                    />
                  </>
                );
              })()}
            </div>
          ) : null}
          {lineCharts[0] ? (
            <div className={`p-4 ${card}`}>
              {(() => {
                const raw = vizById.get(lineCharts[0].id);
                const cfg = vizCfg(raw);
                const live = liveById.get(lineCharts[0].id) ?? null;
                return (
                  <>
                    <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{lineCharts[0].title}</p>
                    <div className={`mt-1 rounded-lg ${isDarkMode ? 'bg-slate-950/40' : 'bg-slate-50/90'}`}>
                      <SalesLineSvg live={live} subtitle={String(cfg.subtitle || 'WEEK-OVER-WEEK')} />
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}
        </section>
      )}

      {tables.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">{tables.map((row) => renderTable(row))}</section>
      ) : null}

      {!embed && !compact ? (
        <p className={`mt-4 border-t pt-3 text-[10px] ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          Sales Performance shell · Area + leaderboard; donut, bar, and line charts; tables page when rows exceed page_size.{' '}
          {liveDataset?.rows?.length
            ? 'Live API rows blend where bindings match.'
            : 'Demo configuration until API data loads.'}
        </p>
      ) : null}
    </div>
  );
}

export const DashboardProposalVisualPreview: React.FC<DashboardProposalVisualPreviewProps> = ({
  proposal,
  isDarkMode = false,
  embed = false,
  compact = false,
  className = '',
  liveDataset = null,
}) => {
  const title = getProposalDashboardTitle(proposal);
  const objective = typeof proposal.objective === 'string' ? proposal.objective.trim() : '';
  const layout =
    typeof proposal.layout_suggestion === 'string'
      ? proposal.layout_suggestion.trim()
      : typeof proposal.layoutSuggestion === 'string'
        ? proposal.layoutSuggestion.trim()
        : '';

  const filtersRaw = proposal.global_filters ?? proposal.globalFilters;
  const filterLabels = useMemo(() => {
    if (!Array.isArray(filtersRaw)) return [];
    const labels: string[] = [];
    filtersRaw.forEach((f) => {
      if (!f || typeof f !== 'object' || Array.isArray(f)) return;
      const name = (f as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) labels.push(name.trim());
    });
    return labels;
  }, [filtersRaw]);

  const rows = useMemo(() => collectProposalVisualizationRows(proposal), [proposal]);

  const liveById = useMemo(() => {
    const map = new Map<string, LiveVizBinding | null>();
    const rec = liveDataset?.rows ?? [];
    if (!rec.length) {
      rows.forEach((r) => map.set(r.id, null));
      return map;
    }
    rows.forEach((r) => {
      map.set(r.id, deriveLiveBinding(r, rec));
    });
    return map;
  }, [rows, liveDataset?.rows]);

  const previewShell = getProposalPreviewShell(proposal);
  const vizById = useMemo(() => visualizationRecordById(proposal), [proposal]);

  if (previewShell === 'sales_performance') {
    return (
      <SalesPerformanceLayout
        title={title}
        objective={objective}
        rows={rows}
        vizById={vizById}
        liveById={liveById}
        liveDataset={liveDataset}
        isDarkMode={isDarkMode}
        embed={embed}
        compact={compact}
        className={className}
      />
    );
  }

  const kpis = rows.filter((r) => classifyVisualizationKind(r.type) === 'kpi');
  const charts = rows.filter((r) => classifyVisualizationKind(r.type) === 'chart');
  const tables = rows.filter((r) => classifyVisualizationKind(r.type) === 'table');
  const filters = rows.filter((r) => classifyVisualizationKind(r.type) === 'filter');
  const other = rows.filter((r) => {
    const k = classifyVisualizationKind(r.type);
    return k !== 'kpi' && k !== 'chart' && k !== 'table' && k !== 'filter';
  });

  const outer = compact
    ? isDarkMode
      ? 'min-h-0 bg-transparent text-slate-100'
      : 'min-h-0 bg-transparent text-slate-900'
    : embed
      ? isDarkMode
        ? 'min-h-0 bg-slate-950 text-slate-100'
        : 'min-h-0 bg-slate-50 text-slate-900'
      : isDarkMode
        ? 'min-h-0 rounded-2xl border border-slate-800 bg-slate-950 text-slate-100'
        : 'min-h-0 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm';

  return (
    <div className={`${outer} ${compact ? 'p-3' : embed ? 'p-3' : 'p-4'} ${className}`}>
      <header className={embed ? 'mb-3' : 'mb-4'}>
        {liveDataset?.loading ? (
          <p className={`mb-2 text-[11px] font-medium ${isDarkMode ? 'text-sky-300' : 'text-sky-700'}`}>Fetching API data for preview…</p>
        ) : null}
        {liveDataset?.error ? (
          <p className={`mb-2 rounded-lg border px-2 py-1.5 text-[11px] ${isDarkMode ? 'border-amber-500/35 bg-amber-950/40 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            {liveDataset.error}
          </p>
        ) : null}
        {!liveDataset?.loading && !liveDataset?.error && liveDataset?.rows?.length ? (
          <p className={`mb-2 text-[11px] ${isDarkMode ? 'text-emerald-300/90' : 'text-emerald-700'}`}>
            Showing {liveDataset.rows.length} row{liveDataset.rows.length === 1 ? '' : 's'} from {liveDataset.sourceLabel ?? 'API'}.
          </p>
        ) : null}
        <h2 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-slate-50' : 'text-slate-900'}`}>{title}</h2>
        {objective ? (
          <p className={`mt-1 text-sm leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{objective}</p>
        ) : null}
        {layout ? (
          <p className={`mt-2 text-xs leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            <span className="font-semibold text-violet-500">Layout · </span>
            {layout}
          </p>
        ) : null}
        {(filterLabels.length > 0 || filters.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(filterLabels.length ? filterLabels : filters.map((f) => f.title)).map((label) => (
              <span
                key={label}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <p className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          No blocks in <code className="text-xs">key_metrics_visualizations</code> yet — generate a structured proposal first.
        </p>
      ) : (
        <div className="space-y-6">
          {kpis.length > 0 && (
            <section>
              <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                KPIs
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {kpis.map((r) => (
                  <VizCard key={r.id} row={r} kind="kpi" isDarkMode={isDarkMode} live={liveById.get(r.id) ?? null} />
                ))}
              </div>
            </section>
          )}

          {charts.length > 0 && (
            <section>
              <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                Charts
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {charts.map((r) => (
                  <VizCard key={r.id} row={r} kind="chart" isDarkMode={isDarkMode} live={liveById.get(r.id) ?? null} />
                ))}
              </div>
            </section>
          )}

          {(tables.length > 0 || filters.length > 0 || other.length > 0) && (
            <section>
              <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                Tables &amp; more
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {[...tables, ...filters, ...other].map((r) => (
                  <VizCard
                    key={r.id}
                    row={r}
                    kind={classifyVisualizationKind(r.type)}
                    isDarkMode={isDarkMode}
                    live={liveById.get(r.id) ?? null}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!embed && !compact && (
        <p className={`mt-4 border-t pt-3 text-[10px] ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
          {liveDataset?.rows?.length
            ? 'Charts and KPIs use columns matched from API responses where possible; remaining tiles stay illustrative.'
            : 'Visual preview from proposal JSON · Select a saved API and issue a Bearer JWT (API Builder → Run) to load live rows.'}
        </p>
      )}
    </div>
  );
};
