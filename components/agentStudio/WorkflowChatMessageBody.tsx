import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
} from 'recharts';

const SERIES_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#f59e0b', '#6366f1', '#64748b'];

/** Taller viewport for charts inside the enlarged agent chat panel */
const CHART_BOX_CLASS = 'mx-auto h-80 w-full min-w-0 pt-2';

/** Fixed pixel height so ResponsiveContainer measures correctly for PDF/html2canvas capture. */
const PDF_CHART_PLOT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 340,
  minHeight: 340,
  minWidth: 0,
  position: 'relative',
};

function ChartPlotShell({
  variant,
  children,
}: {
  variant: 'chat' | 'pdf';
  children: React.ReactNode;
}) {
  if (variant === 'pdf') {
    return <div style={PDF_CHART_PLOT_STYLE}>{children}</div>;
  }
  return <div className={CHART_BOX_CLASS}>{children}</div>;
}

/** Model emits ```chart fences with compact JSON. */
export const CHART_GRAPH_HELP = `
When charts help (counts, KPIs, trends, comparisons):
1) Explain briefly in plain text.
2) Then output one fenced block per chart named exactly chart (Markdown-style):

\`\`\`chart
{ "type": "bar", "title": "Optional title", "labels": ["A","B"], "series": [{ "name": "Value", "data": [1, 2] }] }
\`\`\`

Allowed type values: bar, line, area, pie, scatter.
Pie format: {"type":"pie","title":"…","data":[{"name":"Label","value":12}]}
For bar/line/area every series.data length must equal labels length.
Scatter format: {"type":"scatter","title":"…","series":[{"name":"S1","x":[1,2,3],"y":[2,1,4]}]} — each series must have numeric x[] and y[] of the same length.
Use numeric values only inside data arrays.
`.trim();

const CHART_FENCE = /```\s*[Cc]hart\s*([\s\S]*?)```/gi;

export type MessageSegment =
  | { kind: 'text'; value: string }
  | { kind: 'chart'; value: string };

export function splitMessageWithCharts(text: string): MessageSegment[] {
  const re = new RegExp(CHART_FENCE.source, 'gi');
  const segments: MessageSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'text', value: text.slice(last, m.index) });
    }
    segments.push({ kind: 'chart', value: (m[1] ?? '').trim() });
    last = re.lastIndex;
  }
  if (last < text.length) {
    segments.push({ kind: 'text', value: text.slice(last) });
  }
  if (segments.length === 0) {
    segments.push({ kind: 'text', value: text });
  }
  return segments;
}

type MultiSeriesChart = {
  type: 'bar' | 'line' | 'area';
  title?: string;
  labels: string[];
  series: { name: string; data: number[] }[];
};

type PieChartSpec = {
  type: 'pie';
  title?: string;
  data: { name: string; value: number }[];
};

type ScatterChartSpec = {
  type: 'scatter';
  title?: string;
  series: { name: string; x: number[]; y: number[] }[];
};

/** Shared parser for ```chart JSON (chat UI, PDF canvas export). */
export function parseAgentChartJson(
  raw: string
): { ok: true; spec: MultiSeriesChart | PieChartSpec | ScatterChartSpec } | { ok: false; message: string } {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Chart block is not valid JSON.' };
  }
  if (!j || typeof j !== 'object') return { ok: false, message: 'Chart JSON must be an object.' };

  const o = j as Record<string, unknown>;
  const ty = String(o.type ?? '').toLowerCase();

  if (ty === 'pie') {
    const data = o.data;
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, message: 'Pie chart needs non-empty data: [{ name, value }].' };
    }
    const rows: PieChartSpec['data'] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      rows.push({
        name: String(r.name ?? '—'),
        value: typeof r.value === 'number' && !Number.isNaN(r.value) ? r.value : Number(r.value) || 0,
      });
    }
    if (!rows.length) return { ok: false, message: 'Pie chart rows invalid.' };
    return { ok: true, spec: { type: 'pie', title: typeof o.title === 'string' ? o.title : undefined, data: rows } };
  }

  if (ty === 'scatter') {
    const series = o.series;
    if (!Array.isArray(series) || series.length === 0) {
      return { ok: false, message: 'Scatter chart needs non-empty series: [{ name, x[], y[] }].' };
    }
    const outSeries: ScatterChartSpec['series'] = [];
    for (const s of series) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      const name = String(rec.name ?? 'Series');
      const xa = rec.x;
      const ya = rec.y;
      if (!Array.isArray(xa) || !Array.isArray(ya)) continue;
      const x = xa.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v))).map((v) => (Number.isFinite(v) ? v : 0));
      const y = ya.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v))).map((v) => (Number.isFinite(v) ? v : 0));
      if (x.length === 0 || x.length !== y.length) continue;
      outSeries.push({ name, x, y });
    }
    if (!outSeries.length) {
      return {
        ok: false,
        message: 'Scatter series invalid: each needs matching-length numeric x and y arrays.',
      };
    }
    return {
      ok: true,
      spec: {
        type: 'scatter',
        title: typeof o.title === 'string' ? o.title : undefined,
        series: outSeries,
      },
    };
  }

  if (ty === 'bar' || ty === 'line' || ty === 'area') {
    const labels = o.labels;
    if (!Array.isArray(labels) || !labels.every((x) => typeof x === 'string')) {
      return { ok: false, message: `${ty} chart needs string[] labels.` };
    }
    const lab = labels as string[];
    const series = o.series;
    if (!Array.isArray(series) || series.length === 0) return { ok: false, message: `${ty} chart needs series[].` };
    const outSeries: MultiSeriesChart['series'] = [];
    for (const s of series) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      const name = String(rec.name ?? 'Series');
      const dataArr = rec.data;
      if (!Array.isArray(dataArr)) continue;
      const nums = dataArr.map((x) => (typeof x === 'number' ? x : Number(x))).map((x) => (Number.isFinite(x) ? x : 0));
      outSeries.push({ name, data: nums });
    }
    if (!outSeries.length) return { ok: false, message: 'No valid numeric series rows.' };
    const n = lab.length;
    for (const s of outSeries) {
      while (s.data.length < n) s.data.push(0);
      s.data = s.data.slice(0, n);
    }
    return {
      ok: true,
      spec: {
        type: ty as 'bar' | 'line' | 'area',
        title: typeof o.title === 'string' ? o.title : undefined,
        labels: lab,
        series: outSeries,
      },
    };
  }

  return { ok: false, message: `Unknown chart type "${ty}". Use bar, line, area, pie, or scatter.` };
}

function toComboRows(labels: string[], series: MultiSeriesChart['series']) {
  return labels.map((name, i) => {
    const row: Record<string, string | number> = { name };
    for (const s of series) {
      row[s.name] = typeof s.data[i] === 'number' ? s.data[i] : 0;
    }
    return row;
  });
}

function tooltipStyles(isDark: boolean) {
  return {
    contentStyle: {
      background: isDark ? '#1e293b' : '#fff',
      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: isDark ? '#e2e8f0' : '#334155' },
  };
}

/** Shared by chat UI and PDF export (off-screen capture). */
export function WorkflowChartFigure({
  raw,
  isDarkMode,
  variant = 'chat',
}: {
  raw: string;
  isDarkMode: boolean;
  /** `pdf`: explicit plot dimensions so Recharts + html2canvas layout reliably. */
  variant?: 'chat' | 'pdf';
}) {
  const parsed = useMemo(() => parseAgentChartJson(raw), [raw]);

  const tick = isDarkMode ? '#94a3b8' : '#64748b';
  const grid = isDarkMode ? '#334155' : '#e2e8f0';
  const tt = tooltipStyles(isDarkMode);

  if (!parsed.ok) {
    return (
      <div className={`rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-amber-800/60 bg-amber-950/50 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <p className="font-semibold">Chart could not render</p>
        <p className="mt-1 opacity-90">{parsed.message}</p>
      </div>
    );
  }

  const { spec } = parsed;

  const animOff = variant === 'pdf';

  const cardShell =
    variant === 'pdf'
      ? 'rounded-lg border border-slate-200 bg-white p-3 shadow-sm'
      : `space-y-1 rounded-lg border border-slate-200/80 bg-white/70 p-2 dark:border-slate-600/80 dark:bg-slate-950/40`;

  if (spec.type === 'pie') {
    const data = spec.data.map((d) => ({ ...d }));
    return (
      <div
        className={
          variant === 'pdf'
            ? 'space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm'
            : 'space-y-1'
        }
      >
        {spec.title ? (
          <p className={`text-center text-[11px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{spec.title}</p>
        ) : null}
        <ChartPlotShell variant={variant}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip {...tt} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                isAnimationActive={!animOff}
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={variant === 'pdf' ? 110 : 78}
                fill="#8884d8"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartPlotShell>
      </div>
    );
  }

  if (spec.type === 'scatter') {
    const scatterTooltip = tooltipStyles(isDarkMode);
    return (
      <div className={cardShell}>
        {spec.title ? (
          <p className={`text-center text-[11px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{spec.title}</p>
        ) : null}
        <ChartPlotShell variant={variant}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart isAnimationActive={!animOff} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis type="number" dataKey="x" name="x" tick={{ fill: tick, fontSize: 10 }} stroke={grid} />
              <YAxis type="number" dataKey="y" name="y" tick={{ fill: tick, fontSize: 11 }} stroke={grid} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} {...scatterTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {spec.series.map((s, i) => (
                <Scatter
                  key={s.name + i}
                  name={s.name}
                  data={s.x.map((xv, idx) => ({ x: xv, y: s.y[idx] ?? 0 }))}
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPlotShell>
      </div>
    );
  }

  const rows = toComboRows(spec.labels, spec.series);
  const keys = spec.series.map((s) => s.name);
  const tiltLabels = spec.labels.some((x) => x.length > 6);

  const commonAxis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={grid} />
      <XAxis
        dataKey="name"
        tick={{ fill: tick, fontSize: 10 }}
        stroke={grid}
        angle={tiltLabels ? -25 : 0}
        textAnchor={tiltLabels ? 'end' : 'middle'}
        height={tiltLabels ? 56 : undefined}
      />
      <YAxis tick={{ fill: tick, fontSize: 11 }} stroke={grid} />
      <Tooltip {...tt} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  const chartWrap = (
    <ChartPlotShell variant={variant}>
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === 'bar' ? (
          <BarChart isAnimationActive={!animOff} data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {commonAxis}
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : spec.type === 'line' ? (
          <LineChart isAnimationActive={!animOff} data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {commonAxis}
            {keys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        ) : (
          <AreaChart isAnimationActive={!animOff} data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {commonAxis}
            {keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.25} />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </ChartPlotShell>
  );

  return (
    <div className={cardShell}>
      {spec.title ? (
        <p className={`text-center text-[11px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{spec.title}</p>
      ) : null}
      {chartWrap}
    </div>
  );
}

export function WorkflowChatMessageBody({
  text,
  isDarkMode,
  parseCharts,
}: {
  text: string;
  isDarkMode: boolean;
  parseCharts: boolean;
}) {
  const segments = useMemo(() => (parseCharts ? splitMessageWithCharts(text) : [{ kind: 'text' as const, value: text }]), [parseCharts, text]);

  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          seg.value.trim() ? (
            <p key={i} className="whitespace-pre-wrap break-words">
              {seg.value}
            </p>
          ) : null
        ) : (
          <WorkflowChartFigure key={i} raw={seg.value} isDarkMode={isDarkMode} />
        )
      )}
    </div>
  );
}
