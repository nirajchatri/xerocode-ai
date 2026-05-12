export type DashboardTemplate = {
  id: 'sales' | 'financial' | 'hr' | 'inventory';
  title: string;
  summary: string;
  prompt: string;
};

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'sales',
    title: 'Sales',
    summary: 'Revenue + category performance',
    prompt:
      'Sales dashboard with KPI cards, monthly line trend, category donut chart, top products comparison table, and recent transactions table.',
  },
  {
    id: 'financial',
    title: 'Financial',
    summary: 'Margins, P&L and cash trends',
    prompt:
      'Financial analytics dashboard with revenue vs expense trend lines, margin KPIs, bar chart for monthly P&L, expense category donut, and detailed finance table.',
  },
  {
    id: 'hr',
    title: 'Human Resource',
    summary: 'Headcount, attrition and hiring',
    prompt:
      'Human resource dashboard with headcount and attrition KPI cards, hiring trend line, department-wise distribution donut, comparison table by location, and employee data table.',
  },
  {
    id: 'inventory',
    title: 'Inventory',
    summary: 'Stock levels and movement',
    prompt:
      'Inventory dashboard with stock and reorder KPI cards, item movement bar chart, warehouse distribution donut, low-stock comparison table, and wide inventory data table.',
  },
];

