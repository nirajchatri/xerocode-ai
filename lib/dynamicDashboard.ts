/** Derive KPIs, charts, and tables from tabular data + prompt-driven widget intents. */

import {
  describePromptIterations,
  parsePromptDashboardIntent,
  type PromptDashboardIntent,
} from './promptDashboardIntent';

export type DashboardColumn = { name: string; type?: string };

export type KpiCard = {
  label: string;
  value: string;
  subtitle?: string;
};

export type TrendBar = { label: string; valuePct: number; raw: number };

export type CategorySegment = { label: string; value: number; pct: number };

export type TrendRenderMode = 'bars' | 'line' | 'area';

export type LinePoint = { xPct: number; yPct: number; raw: number; label: string };

export type SecondaryChartModel = {
  title: string;
  subtitle: string;
  mode: TrendRenderMode;
  bars: TrendBar[];
  linePoints: LinePoint[];
};

export type DynamicDashboardModel = {
  title: string;
  subtitle: string;
  dataSourceLine: string;
  kpis: KpiCard[];
  trendTitle: string;
  trendSubtitle: string;
  trendBars: TrendBar[];
  trendRenderMode: TrendRenderMode;
  trendLinePoints: LinePoint[];
  categoryTitle: string;
  categorySegments: CategorySegment[];
  categoryAsDonut: boolean;
  tableColumns: string[];
  tableRows: string[][];
  hasData: boolean;
  showKpiRow: boolean;
  showDataTable: boolean;
  histogram: { title: string; subtitle: string; bars: TrendBar[] } | null;
  secondaryChart: SecondaryChartModel | null;
  comparisonTable: { title: string; headers: string[]; rows: string[][] } | null;
  promptIterations: string[];
  tableRowLimit: number;
  intent: PromptDashboardIntent;
};

function parseNumber(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (t === '') {
    return null;
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

export function formatNum(n: number): string {
  if (Math.abs(n) >= 1e9) {
    return `${(n / 1e9).toFixed(2)}B`;
  }
  if (Math.abs(n) >= 1e6) {
    return `${(n / 1e6).toFixed(2)}M`;
  }
  if (Math.abs(n) >= 1e3) {
    return `${(n / 1e3).toFixed(1)}k`;
  }
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toFixed(2);
}

function barsToLinePoints(bars: TrendBar[]): LinePoint[] {
  const n = bars.length;
  if (n === 0) {
    return [];
  }
  return bars.map((b, i) => ({
    xPct: n <= 1 ? 50 : (i / (n - 1)) * 100,
    yPct: 100 - Math.min(100, Math.max(0, b.valuePct)),
    raw: b.raw,
    label: b.label,
  }));
}

function buildHistogram(nums: number[], binCount = 8): TrendBar[] {
  const clean = nums.filter((x) => Number.isFinite(x));
  if (!clean.length) {
    return [];
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) {
    return [{ label: String(min), valuePct: 100, raw: clean.length }];
  }
  const step = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of clean) {
    let i = Math.floor((v - min) / step);
    if (i >= binCount) {
      i = binCount - 1;
    }
    if (i < 0) {
      i = 0;
    }
    counts[i]++;
  }
  const mx = Math.max(...counts, 1);
  return counts.map((c, i) => ({
    label: `${(min + i * step).toFixed(0)}–${(min + (i + 1) * step).toFixed(0)}`,
    valuePct: Math.round((c / mx) * 100),
    raw: c,
  }));
}

type ColAgg = {
  name: string;
  idx: number;
  isNumeric: boolean;
  sum: number;
  avg: number;
  numericCount: number;
  uniqSize: number;
};

function analyzeColumns(columns: DashboardColumn[], rows: string[][]): ColAgg[] {
  const nRows = rows.length;
  return columns.map((c, idx) => {
    let numericCount = 0;
    let sum = 0;
    const uniq = new Set<string>();
    for (const r of rows) {
      const v = (r[idx] ?? '').trim();
      if (v) {
        uniq.add(v);
      }
      const num = parseNumber(v);
      if (num !== null) {
        numericCount++;
        sum += num;
      }
    }
    const ratio = nRows > 0 ? numericCount / nRows : 0;
    const isNumeric = ratio >= 0.45 && numericCount > 0;
    return {
      name: c.name,
      idx,
      isNumeric,
      sum,
      avg: numericCount ? sum / numericCount : 0,
      numericCount,
      uniqSize: uniq.size,
    };
  });
}

function promptBoostsColumn(prompt: string, colName: string): number {
  const p = prompt.toLowerCase();
  const n = colName.toLowerCase();
  if (!p || !n) {
    return 0;
  }
  if (p.includes(n)) {
    return 3;
  }
  const parts = n.split(/[^a-z0-9]+/i).filter((x) => x.length > 2);
  for (const part of parts) {
    if (p.includes(part)) {
      return 1;
    }
  }
  return 0;
}

function buildTrendBarsForColumn(
  rows: string[][],
  col: ColAgg,
  maxPoints = 24,
): TrendBar[] {
  const nums = rows
    .map((r) => parseNumber(r[col.idx] ?? ''))
    .filter((x): x is number => x !== null);
  const slice = nums.slice(-maxPoints);
  const hi = Math.max(...slice.map(Math.abs), 1e-9);
  return slice.map((v, i) => ({
    label: `${i + 1}`,
    valuePct: Math.round((Math.abs(v) / hi) * 100),
    raw: v,
  }));
}

function buildComparisonTable(
  rows: string[][],
  textIdx: number,
  numIdx: number,
  limit = 8,
): { headers: string[]; rows: string[][] } | null {
  const m = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const k = (r[textIdx] ?? '').trim() || '(empty)';
    const v = parseNumber(r[numIdx] ?? '');
    const o = m.get(k) ?? { sum: 0, n: 0 };
    if (v !== null) {
      o.sum += v;
      o.n++;
    }
    m.set(k, o);
  }
  const sorted = [...m.entries()]
    .filter(([, o]) => o.n > 0)
    .sort((a, b) => b[1].sum - a[1].sum)
    .slice(0, limit);
  if (!sorted.length) {
    return null;
  }
  return {
    headers: ['Category', 'Sum', 'Rows'],
    rows: sorted.map(([k, o]) => [k, formatNum(o.sum), String(o.n)]),
  };
}

function emptyModel(
  prompt: string,
  tableLabel: string | undefined,
  dataSourceLine: string,
  intent: PromptDashboardIntent,
): DynamicDashboardModel {
  const baseIterations = describePromptIterations(intent);
  return {
    title: tableLabel ? `Dashboard · ${tableLabel}` : 'Dashboard',
    subtitle: tableLabel
      ? `No rows loaded for ${tableLabel}. Open a table in AI Studio and build again, or check the API.`
      : 'Build from AI Studio with a connected table or Excel sheet to see live metrics.',
    dataSourceLine,
    kpis: [],
    trendTitle: 'Trend',
    trendSubtitle: 'Numeric series from your data (when available)',
    trendBars: [],
    trendRenderMode: 'bars',
    trendLinePoints: [],
    categoryTitle: 'Breakdown',
    categorySegments: [],
    categoryAsDonut: false,
    tableColumns: [],
    tableRows: [],
    hasData: false,
    showKpiRow: intent.wantsKpi,
    showDataTable: intent.wantsDataTable,
    histogram: null,
    secondaryChart: null,
    comparisonTable: null,
    promptIterations: baseIterations,
    tableRowLimit: intent.wantsWideTable ? 50 : 15,
    intent,
  };
}

export function computeDynamicDashboard(
  columns: DashboardColumn[],
  rows: string[][],
  options: {
    userPrompt?: string;
    tableLabel?: string;
    dataSourceLabel?: string;
    maxKpis?: number;
  }
): DynamicDashboardModel {
  const maxKpis = options.maxKpis ?? 5;
  const prompt = options.userPrompt?.trim() ?? '';
  const tableLabel = options.tableLabel?.trim();
  const dataSourceLine = options.dataSourceLabel?.trim() || 'Workspace';
  const intent = parsePromptDashboardIntent(prompt);

  if (!columns.length || !rows.length) {
    return emptyModel(prompt, tableLabel, dataSourceLine, intent);
  }

  const aggs = analyzeColumns(columns, rows);
  const numericCols = aggs
    .filter((a) => a.isNumeric)
    .sort((a, b) => {
      const sb = promptBoostsColumn(prompt, b.name) - promptBoostsColumn(prompt, a.name);
      if (sb !== 0) {
        return sb;
      }
      return b.numericCount - a.numericCount;
    });

  const textCols = aggs
    .filter((a) => !a.isNumeric && a.uniqSize >= 2 && a.uniqSize <= 24 && a.uniqSize < rows.length * 0.85)
    .sort((a, b) => a.uniqSize - b.uniqSize);

  const kpis: KpiCard[] = [];
  if (intent.wantsKpi) {
    for (const c of numericCols.slice(0, Math.max(0, maxKpis - 1))) {
      kpis.push({
        label: c.name,
        value: formatNum(c.sum),
        subtitle: `avg ${formatNum(c.avg)} · ${c.numericCount} numeric`,
      });
    }
    kpis.push({
      label: 'Rows in view',
      value: String(rows.length),
      subtitle: columns.length ? `${columns.length} columns` : undefined,
    });
  }

  let trendBars: TrendBar[] = [];
  let trendTitle = 'Value trend';
  let trendSubtitle = 'Last values from the primary numeric column';
  if (numericCols.length) {
    const c = numericCols[0];
    trendTitle = `${c.name} (sample)`;
    trendBars = buildTrendBarsForColumn(rows, c);
  } else {
    trendSubtitle = 'No numeric column detected in this sample';
  }

  let trendRenderMode: TrendRenderMode = 'bars';
  if (intent.wantsAreaChart) {
    trendRenderMode = 'area';
  } else if (intent.wantsLineChart) {
    trendRenderMode = 'line';
  }

  const trendLinePoints = barsToLinePoints(trendBars);

  let categoryTitle = 'Category mix';
  let categorySegments: CategorySegment[] = [];
  if (textCols.length) {
    const c = textCols[0];
    categoryTitle = `By ${c.name}`;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = (r[c.idx] ?? '').trim() || '(empty)';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const total = sorted.reduce((s, [, n]) => s + n, 0) || 1;
    categorySegments = sorted.map(([label, value]) => ({
      label: label.length > 28 ? `${label.slice(0, 26)}…` : label,
      value,
      pct: Math.round((value / total) * 100),
    }));
  }

  const categoryAsDonut = intent.wantsPieOrDonut && categorySegments.length > 0;

  let histogram: DynamicDashboardModel['histogram'] = null;
  if (intent.wantsHistogram && numericCols.length) {
    const c = numericCols[0];
    const nums = rows
      .map((r) => parseNumber(r[c.idx] ?? ''))
      .filter((x): x is number => x !== null);
    const bars = buildHistogram(nums);
    if (bars.length) {
      histogram = {
        title: `Distribution · ${c.name}`,
        subtitle: 'Frequency by value range (prompt: histogram / distribution)',
        bars,
      };
    }
  }

  let secondaryChart: SecondaryChartModel | null = null;
  const wantSecond =
    numericCols.length > 1 && (intent.wantsMultiChart || intent.chartDepth >= 2);
  if (wantSecond) {
    const c = numericCols[1];
    const bars = buildTrendBarsForColumn(rows, c, 24);
    const mode: TrendRenderMode = trendRenderMode === 'bars' ? 'line' : 'bars';
    secondaryChart = {
      title: `${c.name} (second series)`,
      subtitle: 'Added from your prompt (multiple charts / extra graph)',
      mode,
      bars,
      linePoints: barsToLinePoints(bars),
    };
  }

  let comparisonTable: DynamicDashboardModel['comparisonTable'] = null;
  if (intent.wantsComparison && textCols.length && numericCols.length) {
    const built = buildComparisonTable(rows, textCols[0].idx, numericCols[0].idx);
    if (built) {
      comparisonTable = {
        title: `Comparison · ${textCols[0].name} × ${numericCols[0].name}`,
        headers: built.headers,
        rows: built.rows,
      };
    }
  }

  const tableRowLimit = intent.wantsWideTable ? 50 : 15;

  const title = tableLabel ? `Dashboard · ${tableLabel}` : 'Dashboard';

  const subtitleParts: string[] = [];
  if (tableLabel) {
    subtitleParts.push(tableLabel);
  }
  subtitleParts.push(`${rows.length} rows · ${columns.length} columns`);
  if (prompt) {
    subtitleParts.push('Chart layout follows your prompt in the sidebar');
  } else {
    subtitleParts.push('Use the layout prompt to change chart types and widgets');
  }

  const tableColumns = columns.map((c) => c.name);
  const tableRows = rows.slice(0, tableRowLimit);

  const promptIterations = describePromptIterations(intent).filter((line) => {
    if (line.includes('Line-style') && trendRenderMode === 'bars') {
      return false;
    }
    if (line.includes('Area-filled') && trendRenderMode !== 'area') {
      return false;
    }
    if (line.includes('Donut') && !categoryAsDonut) {
      return false;
    }
    if (line.includes('Histogram') && !histogram) {
      return false;
    }
    if (line.includes('Second numeric') && !secondaryChart) {
      return false;
    }
    if (line.includes('Comparison') && !comparisonTable) {
      return false;
    }
    if (line.includes('Expanded') && !intent.wantsWideTable) {
      return false;
    }
    if (line.includes('Data table hidden') && intent.wantsDataTable) {
      return false;
    }
    return true;
  });

  return {
    title,
    subtitle: subtitleParts.join(' · ') || 'Live preview from datasource',
    dataSourceLine,
    kpis,
    trendTitle,
    trendSubtitle,
    trendBars,
    trendRenderMode,
    trendLinePoints,
    categoryTitle,
    categorySegments,
    categoryAsDonut,
    tableColumns,
    tableRows,
    hasData: true,
    showKpiRow: intent.wantsKpi,
    showDataTable: intent.wantsDataTable,
    histogram,
    secondaryChart,
    comparisonTable,
    promptIterations,
    tableRowLimit,
    intent,
  };
}
