import * as XLSX from 'xlsx';

export type ExcelSheetModel = {
  key: string;
  label: string;
  fileName: string;
  sheetName: string;
  columns: Array<{ name: string; type: string; columnType?: string; key?: string }>;
  rows: string[][];
};

const newKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `excel-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/** Match on-screen Excel/CSV text: sheet_to_json raw:false supplies formatted strings. */
const cellToDisplayString = (cell: unknown): string => {
  if (cell == null || cell === '') {
    return '';
  }
  if (cell instanceof Date) {
    return cell.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell);
    } catch {
      return String(cell);
    }
  }
  return String(cell);
};

/** First-row labels as in the file (only empty/whitespace cells become "Column n"). */
const headersFromFirstRow = (firstRow: unknown[]): string[] =>
  (firstRow || []).map((h, i) => {
    const raw = h == null || h === '' ? '' : String(h);
    return raw.trim() === '' ? `Column ${i + 1}` : raw;
  });

const buildTable = (
  fileName: string,
  sheetLabel: string,
  data: unknown[][]
): ExcelSheetModel | null => {
  if (!data.length) {
    return null;
  }
  const headerCells = (data[0] || []) as unknown[];
  const headers = headersFromFirstRow(headerCells);
  const body = data.slice(1).map((row) =>
    headers.map((_, i) => cellToDisplayString((row as unknown[])[i]))
  );
  /** Column metadata for inspector only; UI shows header text as uploaded. */
  const columns = headers.map((h) => ({
    name: h,
    type: 'text',
    columnType: 'text',
    key: '',
  }));
  const shortFile = fileName.replace(/\.[^.]+$/i, '');
  return {
    key: newKey(),
    label: sheetLabel === shortFile || sheetLabel === fileName ? `${fileName}` : `${shortFile} — ${sheetLabel}`,
    fileName,
    sheetName: sheetLabel,
    columns,
    rows: body,
  };
};

export async function parseExcelFilesToTables(files: File[]): Promise<ExcelSheetModel[]> {
  const out: ExcelSheetModel[] = [];

  for (const file of files) {
    const name = file.name;
    const lower = name.toLowerCase();

    if (lower.endsWith('.csv')) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: 'string' });
      const sheetName = wb.SheetNames[0] || 'Sheet1';
      const sheet = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][];
      const table = buildTable(name, name.replace(/\.[^.]+$/i, '') || 'CSV', data);
      if (table) {
        out.push(table);
      }
      continue;
    }

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {
        type: 'array',
        cellDates: true,
        cellNF: true,
        cellText: false,
      });
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as unknown[][];
        const table = buildTable(name, sheetName, data);
        if (table) {
          out.push(table);
        }
      }
    }
  }

  return out;
}
