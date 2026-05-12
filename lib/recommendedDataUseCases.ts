/**
 * Suggested “Recommended data functionality” prompts from datasource type,
 * selected table/sheet names, and (when available) column names.
 */

export type DataUseCaseRecommendation = {
  title: string;
  body: string;
};

export type RecommendedUseCaseContext = {
  connectorType?: 'mysql' | 'postgresql' | 'sqlserver' | 'excel' | 'mongodb' | string | null;
  /** Friendly labels for selected or active tables/sheets */
  tableLabels: string[];
  columnNames: string[];
  multiTable: boolean;
  /** Connection or workbook summary (e.g. friendly DB name, “Excel”) */
  dataSourceHint?: string;
};

const DEFAULT_USE_CASES: DataUseCaseRecommendation[] = [
  {
    title: 'Executive KPI dashboard',
    body: 'Revenue, orders, and conversion with week-over-week trends and top segments.',
  },
  {
    title: 'Sales funnel & pipeline',
    body: 'Stage breakdown, win rate, and forecast vs quota by owner or region.',
  },
  {
    title: 'Inventory & operations',
    body: 'Stock levels, reorder alerts, and supplier lead times in one view.',
  },
  {
    title: 'Customer cohort analysis',
    body: 'Retention, LTV, and behavior by signup cohort or acquisition channel.',
  },
];

type Candidate = DataUseCaseRecommendation & {
  anyOf?: string[];
  allOf?: string[];
  multiOnly?: boolean;
  excelOnly?: boolean;
  sqlOnly?: boolean;
  /** When true, skip if multiple tables/sheets are selected */
  singleTableOnly?: boolean;
};

const CANDIDATES: Candidate[] = [
  {
    title: 'Sales & revenue pulse',
    body: 'Line chart for revenue or order trend, KPI cards for totals, and category breakdown by region or product.',
    anyOf: ['order', 'sale', 'revenue', 'invoice', 'purchase', 'checkout', 'cart', 'payment'],
  },
  {
    title: 'Customer & CRM insights',
    body: 'Donut for segment mix, table of top accounts, and line chart for activity or spend over time.',
    anyOf: ['customer', 'client', 'subscriber', 'lead', 'contact', 'crm', 'account', 'member'],
  },
  {
    title: 'Inventory & supply snapshot',
    body: 'Bar chart for stock by SKU or location, KPIs for low-stock alerts, histogram of quantity distribution.',
    anyOf: ['inventory', 'stock', 'sku', 'warehouse', 'reorder', 'supplier', 'qty', 'quantity'],
  },
  {
    title: 'Product catalog performance',
    body: 'Compare categories with a comparison table, line chart for units sold, hide KPIs if you want chart-first.',
    anyOf: ['product', 'catalog', 'item', 'merch', 'sku', 'category', 'price'],
  },
  {
    title: 'Marketing & acquisition',
    body: 'Funnel-style breakdown by channel or campaign, trend line for conversions, wide table for raw campaign rows.',
    anyOf: ['campaign', 'marketing', 'ad', 'channel', 'utm', 'click', 'impression', 'acquisition'],
  },
  {
    title: 'Support & tickets',
    body: 'Category mix by priority or status, trend of new tickets, comparison table by agent or team.',
    anyOf: ['ticket', 'case', 'support', 'sla', 'agent', 'issue', 'request'],
  },
  {
    title: 'People & HR overview',
    body: 'Breakdown by department or role, KPI cards for headcount metrics, table preview of recent changes.',
    anyOf: ['employee', 'hr', 'payroll', 'hire', 'department', 'salary', 'staff', 'personnel'],
  },
  {
    title: 'Finance & cash view',
    body: 'Area chart for balance or cashflow trend, comparison table by account, donut for expense categories.',
    anyOf: ['ledger', 'balance', 'budget', 'expense', 'account', 'invoice', 'payment', 'tax'],
  },
  {
    title: 'Logistics & delivery',
    body: 'Trend of shipments over time, category by carrier or status, data table for recent deliveries.',
    anyOf: ['shipment', 'delivery', 'tracking', 'carrier', 'fulfill', 'ship', 'route'],
  },
  {
    title: 'Product analytics & events',
    body: 'Line chart for event volume, histogram of session lengths, compare user segments in a summary table.',
    anyOf: ['event', 'session', 'pageview', 'metric', 'analytics', 'log', 'activity', 'usage'],
  },
  {
    title: 'Cross-table blended dashboard',
    body: 'Use _source column for breakdown, line chart on shared time field, comparison table across entities, two charts.',
    multiOnly: true,
    anyOf: [],
  },
  {
    title: 'Multi-sheet workbook summary',
    body: 'Donut using _source for sheet mix, line chart on a numeric column, wide data table, hide KPIs if cluttered.',
    multiOnly: true,
    excelOnly: true,
    anyOf: [],
  },
  {
    title: 'Spreadsheet exploration',
    body: 'Histogram on a numeric column, bar trend on sampled rows, pie or donut for a text column, full data preview.',
    excelOnly: true,
    singleTableOnly: true,
    anyOf: [],
  },
  {
    title: 'Database table explorer',
    body: 'Line chart on a date or ID series, KPIs on numeric columns, filter-friendly data grid with wide table.',
    sqlOnly: true,
    singleTableOnly: true,
    anyOf: [],
  },
];

function normalizeTokens(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildHaystack(ctx: RecommendedUseCaseContext): string {
  const parts = [
    ctx.dataSourceHint ?? '',
    ctx.connectorType ?? '',
    ...ctx.tableLabels,
    ...ctx.columnNames,
  ];
  return normalizeTokens(parts.join(' '));
}

function matchesCandidate(haystack: string, c: Candidate, ctx: RecommendedUseCaseContext): boolean {
  if (c.multiOnly && !ctx.multiTable) {
    return false;
  }
  if (c.singleTableOnly && ctx.multiTable) {
    return false;
  }
  if (c.excelOnly && ctx.connectorType !== 'excel') {
    return false;
  }
  if (c.sqlOnly && !['mysql', 'postgresql', 'sqlserver'].includes(String(ctx.connectorType))) {
    return false;
  }
  if ((c.sqlOnly || (c.excelOnly && c.singleTableOnly)) && ctx.tableLabels.length === 0) {
    return false;
  }
  if (c.anyOf?.length) {
    const hit = c.anyOf.some((k) => haystack.includes(normalizeTokens(k).replace(/\s+/g, ' ')));
    if (!hit) {
      return false;
    }
  }
  if (c.allOf?.length) {
    const ok = c.allOf.every((k) => haystack.includes(normalizeTokens(k).replace(/\s+/g, ' ')));
    if (!ok) {
      return false;
    }
  }
  if (!c.anyOf?.length && !c.allOf?.length && !c.multiOnly && !c.excelOnly && !c.sqlOnly) {
    return false;
  }
  if ((c.multiOnly || c.excelOnly || c.sqlOnly) && !c.anyOf?.length && !c.allOf?.length) {
    return true;
  }
  return true;
}

/** Merge table label from schemaTable like "a + b" */
export function parseTableLabelsFromSchemaTable(schemaTable?: string | null): string[] {
  if (!schemaTable?.trim()) {
    return [];
  }
  return schemaTable
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildRecommendedDataUseCases(ctx: RecommendedUseCaseContext): DataUseCaseRecommendation[] {
  const haystack = buildHaystack(ctx);
  const out: DataUseCaseRecommendation[] = [];
  const seen = new Set<string>();

  const push = (item: DataUseCaseRecommendation) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push({ title: item.title, body: item.body });
  };

  for (const c of CANDIDATES) {
    if (out.length >= 6) {
      break;
    }
    if (!matchesCandidate(haystack, c, ctx)) {
      continue;
    }
    push({ title: c.title, body: c.body });
  }

  for (const d of DEFAULT_USE_CASES) {
    if (out.length >= 6) {
      break;
    }
    push(d);
  }

  return out.slice(0, 6);
}
