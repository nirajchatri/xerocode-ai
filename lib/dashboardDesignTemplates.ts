/**
 * Layout templates for Dashboard Design Studio — structure inspired by modern SaaS dashboards
 * (sidebar nav, KPI band, dual charts, dense data table).
 */

export type DashboardDesignTemplateId =
  | 'sales_performance'
  | 'nexus_sales'
  | 'operations_command'
  | 'marketing_growth'
  | 'minimal_exec';

export type DashboardDesignTemplate = {
  id: DashboardDesignTemplateId;
  name: string;
  tagline: string;
  /** Tailwind-friendly accent for thumbnail chips */
  accentClass: string;
  /** Injected into every LLM request while this template is selected */
  blueprintForLlm: string;
  /** Optional JSON skeleton for “preview without waiting for the model” */
  starterProposal?: Record<string, unknown>;
};

const salesPerformanceStarter: Record<string, unknown> = {
  dashboard_title: 'Sales Performance Dashboard',
  objective: 'Real-time insights from xerocode.ai data stream',
  preview_shell: 'sales_performance',
  data_source: {
    type: 'api_or_warehouse',
    connection_summary: 'Orders / sales aggregates keyed by product category and day',
    authentication_summary: 'Tenant-scoped API or warehouse role',
    extraction_notes:
      'KPI row from summary metrics endpoint; monthly trend from daily_sales; leaderboards from revenue_by_category; detail tables from product_rollups.',
  },
  key_metrics_visualizations: [
    {
      id: 'kpi_total_revenue',
      type: 'kpi_card',
      title: 'Total Revenue',
      data_field: 'total_revenue',
      configuration: {
        label: 'TOTAL REVENUE',
        format: 'currency',
        preview_value: '$11,107,422',
        delta_pct: 12.6,
        delta_direction: 'up',
      },
      interactive_features: ['compare_prior_period'],
    },
    {
      id: 'kpi_avg_unit',
      type: 'kpi_card',
      title: 'Avg. Unit Value',
      data_field: 'avg_unit_value',
      configuration: {
        label: 'AVG. UNIT VALUE',
        format: 'currency',
        preview_value: '$2,792',
        delta_pct: 3.2,
        delta_direction: 'up',
      },
      interactive_features: [],
    },
    {
      id: 'kpi_units_sold',
      type: 'kpi_card',
      title: 'Units Sold',
      data_field: 'units_sold',
      configuration: {
        label: 'UNITS SOLD',
        format: 'integer',
        preview_value: '3,978',
        delta_pct: 2.1,
        delta_direction: 'down',
      },
      interactive_features: [],
    },
    {
      id: 'kpi_leading_category',
      type: 'kpi_card',
      title: 'Leading Category',
      data_field: 'leading_category',
      configuration: {
        label: 'LEADING CATEGORY',
        format: 'category_highlight',
        category_name: 'Blazers',
        preview_subvalue: '$6,236,307',
        delta_pct: 0.4,
        delta_direction: 'up',
      },
      interactive_features: [],
    },
    {
      id: 'chart_monthly_sales',
      type: 'area_chart',
      title: 'Monthly Sales Trend',
      x_axis: 'day',
      y_axis: 'sales_usd',
      configuration: {
        subtitle: 'REAL-TIME PERFORMANCE METRICS',
        legend: 'CURRENT',
        accent: 'violet',
      },
      interactive_features: ['brush_zoom'],
    },
    {
      id: 'chart_top_products',
      type: 'category_leaderboard',
      title: 'Top Performing Products',
      configuration: {
        subtitle: 'CATEGORY DISTRIBUTION',
        items: [
          { name: 'Blazers', value: 6236307 },
          { name: 'Jeans', value: 1754325 },
          { name: 'Shorts', value: 890210 },
          { name: 'Shirts', value: 720440 },
          { name: 'Tops', value: 501230 },
          { name: 'T-shirts', value: 310090 },
        ],
      },
      interactive_features: ['row_hover_highlight'],
    },
    {
      id: 'chart_revenue_mix',
      type: 'donut_chart',
      title: 'Revenue by Category',
      configuration: {
        subtitle: 'REVENUE MIX',
        series: [
          { name: 'Blazers', value: 6236307 },
          { name: 'Jeans', value: 1754325 },
          { name: 'Tops', value: 980400 },
          { name: 'Other', value: 2128390 },
        ],
      },
      interactive_features: ['slice_drill'],
    },
    {
      id: 'chart_weekly_units',
      type: 'bar_chart',
      title: 'Units Sold by Week',
      x_axis: 'week',
      y_axis: 'units',
      configuration: {
        subtitle: 'WEEKLY PULSE',
        bar_series: [
          { label: 'W1', value: 920 },
          { label: 'W2', value: 1120 },
          { label: 'W3', value: 980 },
          { label: 'W4', value: 1240 },
          { label: 'W5', value: 718 },
        ],
      },
      interactive_features: ['tooltip_compare'],
    },
    {
      id: 'chart_net_line',
      type: 'line_chart',
      title: 'Net Sales Trend',
      x_axis: 'week',
      y_axis: 'net_sales',
      configuration: {
        subtitle: 'WEEK-OVER-WEEK',
      },
      interactive_features: ['hover_points'],
    },
    {
      id: 'tbl_revenue_product',
      type: 'data_table',
      title: 'Revenue by Product',
      configuration: {
        columns: ['PRODUCT', 'REVENUE'],
        page_size: 4,
        paging: true,
        preview_rows: [
          { PRODUCT: 'Blazers', REVENUE: '$6,236,307' },
          { PRODUCT: 'Jeans', REVENUE: '$1,754,325' },
          { PRODUCT: 'Tops', REVENUE: '$982,110' },
          { PRODUCT: 'Shorts', REVENUE: '$744,200' },
          { PRODUCT: 'Shirts', REVENUE: '$621,055' },
          { PRODUCT: 'T-shirts', REVENUE: '$410,420' },
          { PRODUCT: 'Outerwear', REVENUE: '$378,900' },
        ],
      },
      interactive_features: ['sort_columns'],
    },
    {
      id: 'tbl_volume_product',
      type: 'data_table',
      title: 'Volume by Product',
      configuration: {
        columns: ['PRODUCT', 'UNITS SOLD'],
        page_size: 4,
        paging: true,
        preview_rows: [
          { PRODUCT: 'Tops', 'UNITS SOLD': '702' },
          { PRODUCT: 'Blazers', 'UNITS SOLD': '693' },
          { PRODUCT: 'Jeans', 'UNITS SOLD': '541' },
          { PRODUCT: 'Shirts', 'UNITS SOLD': '498' },
          { PRODUCT: 'Shorts', 'UNITS SOLD': '412' },
          { PRODUCT: 'T-shirts', 'UNITS SOLD': '355' },
        ],
      },
      interactive_features: ['sort_columns'],
    },
  ],
  layout_suggestion:
    'Light gray page (#F8F9FA), white cards ~10px radius. Purple accent charts; green/red KPI deltas. Header + KPI band per reference. Row A: large purple gradient AREA chart (monthly) + category leaderboard. Row B (three tiles): DONUT revenue mix, vertical BAR weekly units, LINE net trend with markers. Bottom: two DATA TABLES in a responsive grid with server-style paging (page_size ~4, Prev/Next).',
  global_filters: [
    {
      name: 'Date range',
      type: 'daterange',
      applies_to: ['kpi_total_revenue', 'chart_monthly_sales', 'tbl_revenue_product', 'tbl_volume_product'],
    },
    {
      name: 'Timeframe',
      type: 'segmented',
      applies_to: ['kpi_total_revenue', 'chart_monthly_sales'],
    },
  ],
  potential_ai_enhancements: [
    'NL summaries on KPI deltas',
    'Forecast ribbon on area chart',
    'Drill from leaderboard into product detail',
  ],
};

const nexusSalesStarter: Record<string, unknown> = {
  dashboard_title: 'Nexus Sales Dashboard',
  objective:
    'Give revenue owners a daily command center: KPIs at a glance, revenue vs profit trend, category mix, and actionable recent transactions.',
  data_source: {
    type: 'replace_with_yours',
    connection_summary: 'Orders + customers + products + categories (warehouse or REST aggregates)',
    authentication_summary: 'Bearer / session scoped to tenant',
    extraction_notes:
      'Prefer pre-aggregated metrics endpoints for KPI row; time-series for charts; paginated table for transactions.',
  },
  key_metrics_visualizations: [
    {
      id: 'nav_shell',
      type: 'app_shell_sidebar',
      title: 'Primary navigation rail',
      configuration: { sections: ['dashboard', 'orders', 'customers', 'products', 'analytics'], footer: ['settings', 'logout'] },
      interactive_features: ['route_change', 'collapsed_rail_mobile'],
    },
    {
      id: 'header_bar',
      type: 'dashboard_header',
      title: 'Header — search, notifications, profile, primary CTA',
      configuration: { cta_label: 'Ask AI Analyst', search_placeholder: 'Search orders, customers…' },
      interactive_features: ['global_search', 'notifications_drawer'],
    },
    {
      id: 'kpi_revenue',
      type: 'kpi_card',
      title: 'Total Revenue',
      data_field: 'total_revenue',
      configuration: { format: 'currency', comparison: 'prior_month_pct' },
      interactive_features: ['drill_to_orders_filtered_by_period'],
    },
    {
      id: 'kpi_orders',
      type: 'kpi_card',
      title: 'Total Orders',
      data_field: 'order_count',
      configuration: { format: 'integer', comparison: 'prior_month_pct' },
      interactive_features: ['drill_to_order_list'],
    },
    {
      id: 'kpi_customers',
      type: 'kpi_card',
      title: 'New Customers',
      data_field: 'new_customers_count',
      configuration: { format: 'integer', comparison: 'prior_month_pct' },
      interactive_features: ['drill_to_customers'],
    },
    {
      id: 'kpi_growth',
      type: 'kpi_card',
      title: 'Growth Rate',
      data_field: 'revenue_growth_pct',
      configuration: { format: 'percent', comparison: 'prior_month_pp' },
      interactive_features: ['annotate_with_driver_metrics'],
    },
    {
      id: 'chart_revenue_analytics',
      type: 'multi_series_area_chart',
      title: 'Revenue Analytics',
      x_axis: 'month',
      y_axis: ['revenue', 'profit'],
      configuration: { grain: 'month', range_months: 12, series_colors: ['indigo', 'emerald'] },
      interactive_features: ['brush_zoom', 'cross_filter_category'],
    },
    {
      id: 'chart_category_mix',
      type: 'donut_chart',
      title: 'Sales by Category',
      data_field: 'revenue_by_category',
      configuration: { dimension: 'category', metric: 'revenue', top_n: 6, others_bucket: true },
      interactive_features: ['slice_click_filters_table_and_area_chart'],
    },
    {
      id: 'tbl_recent_tx',
      type: 'data_table',
      title: 'Recent Transactions',
      configuration: {
        columns: ['customer', 'product', 'date', 'amount', 'status', 'actions'],
        sort_default: 'date_desc',
        page_size: 10,
        row_actions: ['view', 'refund_request'],
      },
      interactive_features: ['inline_status_badges', 'row_menu'],
    },
  ],
  layout_suggestion:
    'Light gray canvas (#F9FAFB), white rounded-xl cards with subtle shadow, indigo/violet accent (#6366F1 family). Left fixed nav (~72px) with icon rail + logo; main column: top header row (title left, search center-right, bell + avatar + purple primary button). Below header: greeting strip. Then a 4-column KPI band (equal width on desktop, 2x2 on tablet, stack on mobile). Middle row: 60/40 split — left large revenue analytics area chart, right donut for category mix. Bottom full-width transactions table with semantic status colors (green completed, amber pending, red failed).',
  global_filters: [
    { name: 'Date range', type: 'daterange', applies_to: ['kpi_revenue', 'kpi_orders', 'chart_revenue_analytics', 'tbl_recent_tx'] },
    { name: 'Region', type: 'multi_select', applies_to: ['kpi_revenue', 'chart_category_mix', 'tbl_recent_tx'] },
  ],
  potential_ai_enhancements: [
    'Natural-language “Ask AI Analyst” on filtered context',
    'Anomaly highlights on revenue spike/drop vs forecast',
    'Smart narratives on KPI cards',
  ],
};

const operationsStarter: Record<string, unknown> = {
  dashboard_title: 'Operations Command Center',
  objective: 'Monitor throughput, backlog, SLA risk, and live incidents in one ops-oriented layout.',
  data_source: {
    type: 'replace_with_yours',
    connection_summary: 'Tickets / jobs / queues / SLA timers',
    authentication_summary: 'Role-based (agent vs manager)',
  },
  key_metrics_visualizations: [
    { id: 'kpi_open', type: 'kpi_card', title: 'Open Tickets', data_field: 'open_count', interactive_features: ['drill_queue'] },
    { id: 'kpi_sla', type: 'kpi_card', title: 'SLA at risk', data_field: 'sla_breach_risk_count', interactive_features: ['sort_by_due'] },
    { id: 'kpi_throughput', type: 'kpi_card', title: 'Throughput / hr', data_field: 'resolved_per_hour', interactive_features: ['compare_teams'] },
    { id: 'chart_backlog', type: 'stacked_bar_chart', title: 'Backlog by priority', x_axis: 'day', y_axis: 'count_by_priority', interactive_features: ['click_to_filter'] },
    { id: 'tbl_queue', type: 'data_table', title: 'Live queue', configuration: { columns: ['id', 'assignee', 'priority', 'status', 'age'], page_size: 15 }, interactive_features: ['bulk_assign'] },
  ],
  layout_suggestion:
    'Dense ops UI: top KPI strip, middle stacked bar trend, bottom wide queue table with urgency coloring; optional slim secondary sidebar for filters.',
  global_filters: [
    { name: 'Team', type: 'select', applies_to: ['kpi_open', 'chart_backlog', 'tbl_queue'] },
    { name: 'Priority', type: 'multi_select', applies_to: ['tbl_queue'] },
  ],
  potential_ai_enhancements: ['Predict SLA breach', 'Suggested routing', 'Digest summaries'],
};

const marketingStarter: Record<string, unknown> = {
  dashboard_title: 'Marketing Growth Pulse',
  objective: 'Track acquisition funnel performance, channel ROI, and cohort retention signals.',
  data_source: {
    type: 'replace_with_yours',
    connection_summary: 'Ad platforms + web analytics + CRM leads',
  },
  key_metrics_visualizations: [
    { id: 'kpi_spend', type: 'kpi_card', title: 'Ad spend (MTD)', data_field: 'ad_spend_mtd', configuration: { format: 'currency' }, interactive_features: ['drill_channel'] },
    { id: 'kpi_cpl', type: 'kpi_card', title: 'CPL', data_field: 'cost_per_lead', interactive_features: ['compare_campaigns'] },
    { id: 'kpi_conv', type: 'kpi_card', title: 'Signup conv.', data_field: 'conversion_rate', configuration: { format: 'percent' }, interactive_features: [] },
    { id: 'chart_funnel', type: 'funnel_chart', title: 'Acquisition funnel', configuration: { stages: ['impression', 'click', 'lead', 'qualified', 'won'] }, interactive_features: ['stage_click_filters'] },
    { id: 'chart_channels', type: 'bar_chart', title: 'Performance by channel', x_axis: 'channel', y_axis: 'roas', interactive_features: ['toggle_metric'] },
    { id: 'tbl_campaigns', type: 'data_table', title: 'Active campaigns', configuration: { columns: ['campaign', 'spend', 'conversions', 'roas', 'status'], page_size: 12 }, interactive_features: [] },
  ],
  layout_suggestion:
    'Marketing aesthetic: vibrant gradients sparingly, funnel center-left, channel bars right, campaign table below; consistent rounded-2xl cards.',
  global_filters: [
    { name: 'Campaign', type: 'select', applies_to: ['chart_channels', 'tbl_campaigns'] },
    { name: 'Period', type: 'daterange', applies_to: ['kpi_spend', 'chart_funnel'] },
  ],
  potential_ai_enhancements: ['Auto narrative on funnel drop-offs', 'Budget reallocation suggestions'],
};

const minimalExecStarter: Record<string, unknown> = {
  dashboard_title: 'Executive Snapshot',
  objective: 'Ultra-focused board-ready view: three KPIs and one primary trend.',
  data_source: { type: 'replace_with_yours', connection_summary: 'Monthly exec mart or summary API' },
  key_metrics_visualizations: [
    { id: 'kpi_north_star', type: 'kpi_card', title: 'North-star metric', data_field: 'north_star', interactive_features: [] },
    { id: 'kpi_secondary_a', type: 'kpi_card', title: 'Revenue', data_field: 'revenue', configuration: { format: 'currency' }, interactive_features: [] },
    { id: 'kpi_secondary_b', type: 'kpi_card', title: 'Margin', data_field: 'margin_pct', configuration: { format: 'percent' }, interactive_features: [] },
    { id: 'chart_primary', type: 'line_chart', title: '12-month trend', x_axis: 'month', y_axis: 'north_star', interactive_features: ['forecast_overlay'] },
  ],
  layout_suggestion:
    'Minimal chrome: centered title, three equal KPI cards, single large line chart; generous whitespace; monochrome with one accent.',
  global_filters: [{ name: 'Reporting period', type: 'daterange', applies_to: ['kpi_north_star', 'chart_primary'] }],
  potential_ai_enhancements: ['One-paragraph exec summary'],
};

export const DASHBOARD_DESIGN_TEMPLATES: DashboardDesignTemplate[] = [
  {
    id: 'sales_performance',
    name: 'Sales Performance',
    tagline: 'KPI · area + leaderboard · donut · bar · line · paged tables',
    accentClass: 'from-violet-600 to-purple-800',
    blueprintForLlm: `Template "Sales Performance" (pixel-polished retail analytics — match common SaaS sales dashboards):
- Page: very light gray background (#F8F9FA), white metric cards, subtle borders, rounded corners ~8–12px.
- HEADER: left — bold title "Sales Performance Dashboard" + muted subtitle "Real-time insights from xerocode.ai data stream". Right — segmented control three options ("Last 7 Days", "Monthly View" as selected dark pill, "Year to Date") + compact date range control labeled RANGE with two calendar chips (01/05/2025 → 31/05/2025).
- ROW 1 — FOUR equal KPI cards in one band. Each: small uppercase gray label, huge bold metric, pill badge for delta (green +X% positive, red −X% negative). Metrics: Total Revenue $11,107,422 +12.6%; Avg Unit Value $2,792 +3.2%; Units Sold 3,978 −2.1%; Leading Category "Blazers" with secondary line $6,236,307 +0.4%.
- ROW 2 — split ~2/3 + 1/3. LEFT card "Monthly Sales Trend" subtitle caps "REAL-TIME PERFORMANCE METRICS", legend dot "CURRENT". Purple smooth LINE/AREA chart (filled gradient under line). RIGHT card "Top Performing Products" subtitle "CATEGORY DISTRIBUTION": vertical list with purple horizontal bars.
- ROW 3 — THREE tiles in one grid: (1) DONUT or PIE chart "Revenue by Category" with legend segments; (2) vertical BAR chart "Units Sold by Week" with purple columns; (3) LINE chart "Net Sales Trend" with point markers (distinct from the large area chart — stroke-only line OK).
- ROW 4 — TWO equal-width DATA TABLE cards with uppercase headers; include configuration.page_size (e.g. 4), paging: true, and preview_rows with 6–12 rows so the preview shows Prev/Next paging controls.
Use preview_shell "sales_performance" and visualization types: kpi_card, area_chart, category_leaderboard, donut_chart, bar_chart, line_chart, data_table.`,
    starterProposal: salesPerformanceStarter,
  },
  {
    id: 'nexus_sales',
    name: 'Nexus Sales',
    tagline: 'Sidebar app shell · KPI band · area + donut · transactions table',
    accentClass: 'from-violet-500 to-indigo-600',
    blueprintForLlm: `Template "Nexus Sales" (high-fidelity SaaS dashboard):
- Visual: light gray page background, white rounded-xl cards, subtle shadows, primary accent indigo/violet (~#6366F1), semantic status colors on badges.
- App shell: fixed LEFT icon sidebar with logo, nav items (Dashboard active, Orders, Customers, Products, Analytics), footer Settings + Logout.
- Top header in main area: page title / overview, global search, notifications, avatar, prominent purple primary button (e.g. "Ask AI Analyst").
- Greeting strip under header (personalized hello + short subtitle).
- ROW 1: FOUR KPI cards in one band — Total Revenue, Total Orders, New Customers, Growth Rate — each shows primary metric, small trend vs prior period, icon.
- ROW 2 split: LEFT ~60% large "Revenue Analytics" multi-series AREA chart (e.g. Revenue vs Profit by month, 12 months). RIGHT ~40% DONUT "Sales by Category" with labeled segments.
- ROW 3: full-width "Recent Transactions" TABLE — columns Customer (avatar+name+id), Product, Date, Amount, Status with colored dots, Actions menu.
Adapt metric names and bindings to the user's real schema and datasource; preserve this spatial hierarchy and component categories.`,
    starterProposal: nexusSalesStarter,
  },
  {
    id: 'operations_command',
    name: 'Operations',
    tagline: 'Tickets · SLA · backlog trend · live queue',
    accentClass: 'from-amber-500 to-orange-600',
    blueprintForLlm: `Template "Operations Command":
Top KPI strip for open volume, SLA-at-risk count, throughput.
Middle stacked bar or trend for backlog by priority.
Bottom wide operational table with assignment, priority, aging; urgency coloring.`,
    starterProposal: operationsStarter,
  },
  {
    id: 'marketing_growth',
    name: 'Marketing',
    tagline: 'Spend · funnel · channels · campaigns',
    accentClass: 'from-pink-500 to-rose-600',
    blueprintForLlm: `Template "Marketing Growth":
KPI row for spend, CPL, conversion.
Funnel visualization plus channel comparison chart.
Campaign performance table with ROAS.`,
    starterProposal: marketingStarter,
  },
  {
    id: 'minimal_exec',
    name: 'Executive',
    tagline: 'Three KPIs · single trend · board-ready',
    accentClass: 'from-slate-600 to-slate-800',
    blueprintForLlm: `Template "Executive Snapshot":
Minimal chrome; exactly three KPI cards and one dominant trend chart; whitespace-heavy; board-ready.`,
    starterProposal: minimalExecStarter,
  },
];

export function getDashboardDesignTemplate(id: DashboardDesignTemplateId | string | null): DashboardDesignTemplate | null {
  if (!id) return null;
  return DASHBOARD_DESIGN_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function templateContextBlock(template: DashboardDesignTemplate | null): string {
  if (!template) return '';
  return ['--- Selected layout template ---', `Template id: ${template.id}`, `Template name: ${template.name}`, template.blueprintForLlm].join('\n');
}
