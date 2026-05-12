/** Parsing helpers for Dashboard Design Studio structured proposals (LLM JSON). */

export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/m, '')
    .trim();
}

export function tryParseDashboardProposal(raw: string): { json: Record<string, unknown>; pretty: string } | null {
  const cleaned = stripJsonFence(raw);
  const attempts = [cleaned, extractFirstJsonObject(cleaned) || '', extractFirstJsonObject(raw) || ''].filter(Boolean);
  for (const slice of attempts) {
    try {
      const parsed = JSON.parse(slice) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const o = parsed as Record<string, unknown>;
      const title = o.dashboard_title ?? o.dashboardTitle;
      if (typeof title !== 'string' || !title.trim()) continue;
      const pretty = JSON.stringify(parsed, null, 2);
      return { json: o, pretty };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Merge editable dashboard title / objective into proposal JSON (pretty-printed). */
export function mergeDashboardMetaIntoProposalJson(
  proposalPretty: string,
  meta: { title: string; objective: string }
): { ok: true; pretty: string } | { ok: false } {
  const cleaned = stripJsonFence(proposalPretty);
  const attempts = [cleaned, extractFirstJsonObject(cleaned) || '', extractFirstJsonObject(proposalPretty) || ''].filter(
    Boolean
  );
  for (const slice of attempts) {
    try {
      const parsed = JSON.parse(slice) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const o = parsed as Record<string, unknown>;
      const title = meta.title.trim() || 'Untitled dashboard';
      o.dashboard_title = title;
      o.dashboardTitle = title;
      o.objective = meta.objective;
      const pretty = JSON.stringify(o, null, 2);
      return { ok: true, pretty };
    } catch {
      /* next */
    }
  }
  return { ok: false };
}

export function getProposalDashboardTitle(proposal: Record<string, unknown>): string {
  const t = proposal.dashboard_title ?? proposal.dashboardTitle;
  return typeof t === 'string' && t.trim() ? t.trim() : 'Dashboard';
}

export type ProposalVisualizationRow = {
  id: string;
  type: string;
  title: string;
  hint?: string;
};

function strRecord(val: unknown): Record<string, unknown> | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  return val as Record<string, unknown>;
}

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Normalize key_metrics_visualizations (or camelCase) into rows for the visual preview. */
export function collectProposalVisualizationRows(proposal: Record<string, unknown>): ProposalVisualizationRow[] {
  const raw = proposal.key_metrics_visualizations ?? proposal.keyMetricsVisualizations;
  if (!Array.isArray(raw)) return [];
  const out: ProposalVisualizationRow[] = [];
  raw.forEach((item, idx) => {
    const o = strRecord(item);
    if (!o) return;
    const id = pickStr(o.id, o.component_id, `viz-${idx + 1}`);
    const type = pickStr(o.type, o.chart_type, o.kind, 'widget').toLowerCase();
    const title = pickStr(o.title, o.label, o.name, type || `Block ${idx + 1}`);
    const hintParts = [
      pickStr(o.data_field, o.metric, o.y_axis, o.yAxis),
      pickStr(o.x_axis, o.xAxis, o.dimension),
    ].filter(Boolean);
    const hint = hintParts.length ? hintParts.join(' · ') : undefined;
    out.push({ id, type, title, hint });
  });
  return out;
}

export function classifyVisualizationKind(type: string): 'kpi' | 'chart' | 'table' | 'filter' | 'other' {
  const t = type.toLowerCase();
  if (/\b(kpi|metric|scorecard|card|gauge|number)\b/.test(t) || /(kpi_card|metric_card|score_card)/.test(t)) return 'kpi';
  if (/\b(leaderboard|rank_panel)\b/.test(t)) return 'chart';
  if (/\b(chart|graph|line|bar|area|pie|donut|scatter|heatmap|spark|funnel)\b/.test(t)) return 'chart';
  if (/\b(table|grid)\b/.test(t) || /\blist\b/.test(t)) return 'table';
  if (/\b(filter|slicer|segment)\b/.test(t)) return 'filter';
  return 'other';
}

/** Full visualization objects keyed by id (preview chrome, demo values, deltas). */
export function visualizationRecordById(proposal: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const raw = proposal.key_metrics_visualizations ?? proposal.keyMetricsVisualizations;
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(raw)) return map;
  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const o = item as Record<string, unknown>;
    const id = pickStr(o.id, o.component_id, `viz-${idx + 1}`);
    map.set(id, o);
  });
  return map;
}

export function getProposalPreviewShell(proposal: Record<string, unknown>): string | null {
  const v = proposal.preview_shell ?? proposal.previewShell;
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
}
