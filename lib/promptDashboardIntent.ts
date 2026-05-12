/**
 * Infer which dashboard widgets to emphasize from natural-language prompts
 * (iteration: "add a line chart", "pie chart", "histogram", "another graph", etc.).
 */

export type PromptDashboardIntent = {
  wantsKpi: boolean;
  wantsBarChart: boolean;
  wantsLineChart: boolean;
  wantsAreaChart: boolean;
  wantsPieOrDonut: boolean;
  wantsHistogram: boolean;
  wantsDataTable: boolean;
  wantsWideTable: boolean;
  wantsMultiChart: boolean;
  wantsComparison: boolean;
  /** Extra chart panels beyond the default trend (0–2) */
  chartDepth: number;
};

const BASE: PromptDashboardIntent = {
  wantsKpi: true,
  wantsBarChart: true,
  wantsLineChart: false,
  wantsAreaChart: false,
  wantsPieOrDonut: false,
  wantsHistogram: false,
  wantsDataTable: true,
  wantsWideTable: false,
  wantsMultiChart: false,
  wantsComparison: false,
  chartDepth: 0,
};

export function parsePromptDashboardIntent(prompt: string): PromptDashboardIntent {
  const p = prompt.trim().toLowerCase();
  if (!p) {
    return { ...BASE };
  }

  const out: PromptDashboardIntent = { ...BASE };

  if (/\b(no|without|hide|remove)\s+(kpi|metrics?|cards?)\b/.test(p) || /\bonly\s+(charts?|graphs?)\b/.test(p)) {
    out.wantsKpi = false;
  }
  if (/\b(kpi|metrics?|cards?|indicators?|gauges?)\b/.test(p)) {
    out.wantsKpi = true;
  }

  if (
    /\b(bar|column)s?\s*(chart|graph|plot)?\b/.test(p) ||
    /\bbarchart\b/.test(p) ||
    /\bbar\s+graph\b/.test(p)
  ) {
    out.wantsBarChart = true;
  }
  if (
    /\b(line|sparkline|time\s*series)\s*(chart|graph|plot)?\b/.test(p) ||
    /\blinechart\b/.test(p) ||
    /\bline\s+graph\b/.test(p) ||
    /\btrend\s*(line|chart|graph)?\b/.test(p) ||
    /\bover\s+time\b/.test(p) ||
    /\btime\s+series\b/.test(p)
  ) {
    out.wantsLineChart = true;
  }
  if (/\btrend(s|ing)?\b/.test(p) && !/\bbar\s+trend\b/.test(p)) {
    out.wantsLineChart = true;
  }
  if (/\barea\s*(chart|graph|plot)?\b/.test(p) || /\bareachart\b/.test(p) || /\bfilled\s*(curve|area)\b/.test(p)) {
    out.wantsAreaChart = true;
    out.wantsLineChart = true;
  }
  if (/\b(pie|donut)\s*(chart|graph)?\b/.test(p) || /\bpiechart\b/.test(p) || /\bdonutchart\b/.test(p)) {
    out.wantsPieOrDonut = true;
  }
  if (/\b(histogram|distribution|frequency|bins?)\b/.test(p)) {
    out.wantsHistogram = true;
  }
  if (/\b(table|grid|data\s*grid|spreadsheet)\b/.test(p)) {
    out.wantsDataTable = true;
  }
  if (/\b(no|without|hide|remove)\s+(table|grid|data\s*grid)\b/.test(p)) {
    out.wantsDataTable = false;
  }
  if (/\b(full|wide|detailed|more)\s+table\b/.test(p) || /\ball\s+rows\b/.test(p) || /\bexpand(ed)?\s+table\b/.test(p)) {
    out.wantsWideTable = true;
  }
  if (
    /\b(another|second|extra|additional|multiple|several)\s+(chart|graph|plot|visual)/.test(p) ||
    /\b(two|three|2|3)\s+(charts?|graphs?)\b/.test(p) ||
    /\badd\s+(a\s+)?(chart|graph|plot)\b/.test(p)
  ) {
    out.wantsMultiChart = true;
    out.chartDepth = Math.max(out.chartDepth, 2);
  }
  if (/\b(compare|comparison|vs\.?|versus|breakdown\s+by|group\s+by)\b/.test(p)) {
    out.wantsComparison = true;
  }
  if (/\b(chart|graph|plot|visuali[sz]e|dashboard)\b/.test(p)) {
    out.chartDepth = Math.max(out.chartDepth, 1);
  }
  if (/\bgraphs?\b/.test(p) && !out.wantsLineChart && !out.wantsPieOrDonut) {
    out.wantsBarChart = true;
    out.chartDepth = Math.max(out.chartDepth, 1);
  }
  if (/\bvisuali[sz]e\b/.test(p) || /\bplot\b/.test(p) || /\bshow\s+(me\s+)?(a\s+)?(the\s+)?(data|numbers)\b/.test(p)) {
    out.chartDepth = Math.max(out.chartDepth, 1);
  }

  return out;
}

export function describePromptIterations(intent: PromptDashboardIntent): string[] {
  const lines: string[] = [];
  if (intent.wantsLineChart && !intent.wantsAreaChart) {
    lines.push('Line-style trend from your prompt');
  }
  if (intent.wantsAreaChart) {
    lines.push('Area-filled trend from your prompt');
  }
  if (intent.wantsPieOrDonut) {
    lines.push('Donut view for category breakdown');
  }
  if (intent.wantsHistogram) {
    lines.push('Histogram / distribution panel');
  }
  if (intent.wantsMultiChart || intent.chartDepth >= 2) {
    lines.push('Second numeric series chart');
  }
  if (intent.wantsComparison) {
    lines.push('Comparison summary table');
  }
  if (intent.wantsWideTable) {
    lines.push('Expanded data table');
  }
  if (!intent.wantsKpi) {
    lines.push('KPI cards hidden per prompt');
  }
  if (!intent.wantsDataTable) {
    lines.push('Data table hidden per prompt');
  }
  return lines;
}
