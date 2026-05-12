/**
 * Stack multiple tables/sheets into one wide dataset for a single dynamic dashboard view.
 * Each row includes _source (table label); other columns are "Label · columnName" to avoid collisions.
 */

export type MergeTableInput = {
  label: string;
  columns: Array<{ name: string; type?: string }>;
  rows: string[][];
};

export function mergeTablesForDashboard(
  tables: MergeTableInput[],
  options?: { maxRowsPerTable?: number; maxTotalRows?: number }
): { columns: Array<{ name: string; type?: string }>; rows: string[][] } {
  const maxPer = options?.maxRowsPerTable ?? 400;
  const maxTotal = options?.maxTotalRows ?? 2500;

  if (tables.length === 0) {
    return { columns: [], rows: [] };
  }
  if (tables.length === 1) {
    const t = tables[0];
    return {
      columns: t.columns.map((c) => ({ name: c.name, type: c.type })),
      rows: t.rows.slice(0, maxTotal),
    };
  }

  const displayCols: string[] = ['_source'];
  for (const t of tables) {
    for (const c of t.columns) {
      const d = `${t.label} · ${c.name}`;
      if (!displayCols.includes(d)) {
        displayCols.push(d);
      }
    }
  }

  const rows: string[][] = [];
  for (const t of tables) {
    const idx = new Map(t.columns.map((c, i) => [c.name, i]));
    for (const r of t.rows.slice(0, maxPer)) {
      if (rows.length >= maxTotal) {
        break;
      }
      const out = new Array(displayCols.length).fill('');
      out[0] = t.label;
      for (let ci = 1; ci < displayCols.length; ci++) {
        const full = displayCols[ci];
        const sep = ' · ';
        const splitAt = full.indexOf(sep);
        if (splitAt === -1) {
          continue;
        }
        const lbl = full.slice(0, splitAt);
        const col = full.slice(splitAt + sep.length);
        if (lbl === t.label) {
          const j = idx.get(col);
          if (j !== undefined) {
            out[ci] = r[j] ?? '';
          }
        }
      }
      rows.push(out);
    }
    if (rows.length >= maxTotal) {
      break;
    }
  }

  return {
    columns: displayCols.map((name) => ({ name })),
    rows,
  };
}
