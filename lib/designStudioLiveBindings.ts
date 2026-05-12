import type { ProposalVisualizationRow } from './dashboardDesignProposal';
import { classifyVisualizationKind } from './dashboardDesignProposal';

export type LiveVizBinding =
  | { kind: 'kpi'; display: string }
  | { kind: 'chart'; labels: string[]; values: number[] }
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[] }
  | null;

function collectColumns(records: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  records.slice(0, 50).forEach((r) => {
    Object.keys(r).forEach((k) => set.add(k));
  });
  return Array.from(set);
}

function normToken(t: string): string {
  return t.replace(/[_\s]+/g, '').toLowerCase();
}

/** Match API column to proposal hint tokens (substring / equality). */
export function resolveColumn(columns: string[], tokens: string[]): string | null {
  const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  for (const col of columns) {
    const nc = normToken(col);
    for (const tok of cleaned) {
      const nt = normToken(tok);
      if (!nt) continue;
      if (nc === nt || nc.includes(nt) || nt.includes(nc)) return col;
    }
  }
  return null;
}

function splitHintTokens(hint: string | undefined): string[] {
  if (!hint?.trim()) return [];
  return hint
    .split(/[·|,/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cellNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstNumericColumn(records: Record<string, unknown>[], columns: string[]): string | null {
  for (const c of columns) {
    let numericCount = 0;
    for (const r of records.slice(0, 30)) {
      if (cellNumber(r[c]) !== null) numericCount++;
    }
    if (numericCount >= Math.min(3, records.length)) return c;
  }
  return null;
}

function firstStringColumn(records: Record<string, unknown>[], columns: string[], exclude: Set<string>): string | null {
  for (const c of columns) {
    if (exclude.has(c)) continue;
    const v = records[0]?.[c];
    if (typeof v === 'string' && v.trim()) return c;
  }
  for (const c of columns) {
    if (exclude.has(c)) continue;
    if (records.some((r) => typeof r[c] === 'string')) return c;
  }
  return null;
}

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function deriveLiveBinding(row: ProposalVisualizationRow, records: Record<string, unknown>[]): LiveVizBinding {
  if (!records.length) return null;
  const columns = collectColumns(records);
  if (!columns.length) return null;

  const tokens = splitHintTokens(row.hint);
  const kind = classifyVisualizationKind(row.type);

  if (kind === 'kpi') {
    const col = resolveColumn(columns, tokens) ?? firstNumericColumn(records, columns);
    if (!col) return null;
    const nums = records.map((r) => cellNumber(r[col])).filter((n): n is number => n !== null);
    if (nums.length === 0) return null;
    const agg = nums.length > 1 ? nums.reduce((a, b) => a + b, 0) : nums[0];
    return { kind: 'kpi', display: nf.format(agg) };
  }

  if (kind === 'chart') {
    let valueCol = tokens.length > 0 ? resolveColumn(columns, [tokens[0]]) : null;
    let labelCol = tokens.length > 1 ? resolveColumn(columns, tokens.slice(1)) : null;

    if (!valueCol) valueCol = firstNumericColumn(records, columns);
    if (!valueCol) return null;

    if (!labelCol) {
      labelCol = firstStringColumn(records, columns, new Set([valueCol]));
    }
    if (!labelCol) {
      const labels = records.map((_, i) => String(i + 1));
      const values = records.map((r) => cellNumber(r[valueCol])).map((n, i) => (n !== null ? n : i));
      return { kind: 'chart', labels, values };
    }

    const slice = records.slice(0, 24);
    const labels: string[] = [];
    const values: number[] = [];
    slice.forEach((r) => {
      const lab = r[labelCol!];
      const num = cellNumber(r[valueCol!]);
      if (num === null) return;
      labels.push(lab === null || lab === undefined ? '—' : String(lab));
      values.push(num);
    });
    if (values.length === 0) return null;
    return { kind: 'chart', labels, values };
  }

  if (kind === 'table') {
    const prefer = new Set<string>();
    tokens.forEach((t) => {
      const c = resolveColumn(columns, [t]);
      if (c) prefer.add(c);
    });
    let cols =
      prefer.size > 0 ? columns.filter((c) => prefer.has(c)) : columns;
    cols = cols.slice(0, 8);
    return { kind: 'table', columns: cols, rows: records.slice(0, 10) };
  }

  return null;
}
