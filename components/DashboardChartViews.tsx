import React from 'react';
import type { CategorySegment, LinePoint, TrendBar, TrendRenderMode } from '../lib/dynamicDashboard';

const DONUT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#38bdf8',
  '#818cf8',
];

export function SvgTrendChart({
  points,
  mode,
  isDarkMode,
}: {
  points: LinePoint[];
  mode: 'line' | 'area';
  isDarkMode: boolean;
}) {
  if (points.length === 0) {
    return null;
  }
  if (points.length === 1) {
    const p = points[0];
    return (
      <svg viewBox="0 0 100 100" className="h-44 w-full" preserveAspectRatio="xMidYMid meet">
        <circle
          cx={p.xPct}
          cy={p.yPct}
          r={2.5}
          fill={isDarkMode ? '#a5b4fc' : '#4f46e5'}
        />
      </svg>
    );
  }
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct},${p.yPct}`).join(' ');
  const areaD = `M 0,100 L ${points.map((p) => `${p.xPct},${p.yPct}`).join(' L ')} L 100,100 Z`;
  const stroke = isDarkMode ? '#a5b4fc' : '#4f46e5';
  const fill = isDarkMode ? 'rgba(165,180,252,0.22)' : 'rgba(79,70,229,0.12)';
  return (
    <svg viewBox="0 0 100 100" className="h-44 w-full" preserveAspectRatio="none">
      {mode === 'area' ? <path d={areaD} fill={fill} stroke="none" /> : null}
      <path
        d={lineD}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BarTrendChart({ bars, isDarkMode }: { bars: TrendBar[]; isDarkMode: boolean }) {
  return (
    <div className="flex h-44 items-end gap-0.5 px-0.5">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex min-w-[5px] flex-1 flex-col justify-end"
          title={String(b.raw)}
        >
          <div
            className={`w-full rounded-t ${isDarkMode ? 'bg-indigo-400/75' : 'bg-indigo-500/90'}`}
            style={{ height: `${Math.max(b.valuePct, 4)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function CategoryDonut({
  segments,
  isDarkMode,
}: {
  segments: CategorySegment[];
  isDarkMode: boolean;
}) {
  if (!segments.length) {
    return null;
  }
  let acc = 0;
  const parts = segments.map((s, i) => {
    const start = acc;
    acc += Math.min(100, s.pct);
    const end = acc;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${end}%`;
  });
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`h-36 w-36 shrink-0 rounded-full border-4 shadow-inner ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}
        style={{ background: `conic-gradient(${parts.join(', ')})` }}
      />
      <ul className="w-full space-y-1 text-[10px]">
        {segments.map((s, i) => (
          <li
            key={s.label}
            className={`flex justify-between gap-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistogramBars({ bars, isDarkMode }: { bars: TrendBar[]; isDarkMode: boolean }) {
  return (
    <div className="flex h-40 items-end gap-1 px-0.5">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex min-w-[8px] flex-1 flex-col justify-end"
          title={`count ≈ ${b.raw}`}
        >
          <div
            className={`w-full rounded-t ${isDarkMode ? 'bg-emerald-400/70' : 'bg-emerald-600/85'}`}
            style={{ height: `${Math.max(b.valuePct, 5)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function NumericChartBlock({
  title,
  subtitle,
  mode,
  bars,
  linePoints,
  isDarkMode,
}: {
  title: string;
  subtitle: string;
  mode: TrendRenderMode;
  bars: TrendBar[];
  linePoints: LinePoint[];
  isDarkMode: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-3 pr-7">
        <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
          {title}
        </p>
        <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{subtitle}</p>
      </div>
      {bars.length === 0 ? (
        <div
          className={`flex h-44 items-center justify-center text-xs ${
            isDarkMode ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          No numeric data for this chart
        </div>
      ) : mode === 'bars' ? (
        <BarTrendChart bars={bars} isDarkMode={isDarkMode} />
      ) : (
        <SvgTrendChart
          points={linePoints}
          mode={mode === 'area' ? 'area' : 'line'}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}
