import * as XLSX from 'xlsx';

export const TABLE_IMPORT_MAX_ROWS = 10_000;
export const TABLE_IMPORT_MAX_COLS = 200;

const VALID_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

export type ParsedSheet = {
  name: string;
  headers: string[];
  rows: string[][];
};

export function getTableFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function isTableImportFile(filename: string): boolean {
  return VALID_EXTENSIONS.has(getTableFileExtension(filename));
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.w != null && String(cell.w).trim() !== '') {
    return String(cell.w).trim();
  }
  const v = cell.v;
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const hasTime =
      v.getHours() !== 0 ||
      v.getMinutes() !== 0 ||
      v.getSeconds() !== 0 ||
      v.getMilliseconds() !== 0;
    if (!hasTime) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return v.toISOString().replace('T', ' ').slice(0, 19);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v).trim();
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();

  return raw.map((h, i) => {
    let name = h.trim() || `Column ${i + 1}`;
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return name;

    let n = count + 1;
    let candidate = `${name} (${n})`;
    while (seen.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${name} (${n})`;
    }
    seen.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}

function trimGrid(grid: string[][]): string[][] {
  if (grid.length === 0) return grid;
  let minR = grid.length;
  let maxR = -1;
  let minC = grid[0]?.length ?? 0;
  let maxC = -1;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  if (maxR < 0) return [];
  return grid.slice(minR, maxR + 1).map((row) => row.slice(minC, maxC + 1));
}

/**
 * Build a dense 2D grid and expand merged ranges so every covered cell
 * receives the top-left value of the original merge.
 */
export function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  if (!sheet || !sheet['!ref']) return [];

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;

  if (rowCount > TABLE_IMPORT_MAX_ROWS + 1) {
    throw new Error(
      `Sheet exceeds the ${TABLE_IMPORT_MAX_ROWS} row import limit`,
    );
  }
  if (colCount > TABLE_IMPORT_MAX_COLS) {
    throw new Error(
      `Sheet exceeds the ${TABLE_IMPORT_MAX_COLS} column import limit`,
    );
  }

  const grid: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cellToString(sheet[addr] as XLSX.CellObject | undefined));
    }
    grid.push(row);
  }

  const merges = sheet['!merges'] ?? [];
  for (const merge of merges) {
    const originR = merge.s.r - range.s.r;
    const originC = merge.s.c - range.s.c;
    const value = grid[originR]?.[originC] ?? '';
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const gr = r - range.s.r;
        const gc = c - range.s.c;
        if (gr >= 0 && gc >= 0 && grid[gr] && gc < grid[gr].length) {
          grid[gr][gc] = value;
        }
      }
    }
  }

  return trimGrid(grid);
}

export function gridToParsedSheet(
  name: string,
  grid: string[][],
): ParsedSheet | null {
  if (grid.length === 0) return null;

  const headerRow = grid[0];
  const headers = uniqueHeaders(headerRow);
  const rows: string[][] = [];

  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i];
    const cells = headers.map((_, c) => (raw[c] ?? '').trim());
    if (cells.every((v) => v === '')) continue;
    rows.push(cells);
  }

  if (headers.length === 0) return null;
  return { name, headers, rows };
}

function readWorkbook(buffer: Buffer, filename: string): XLSX.WorkBook {
  const ext = getTableFileExtension(filename);
  const opts: XLSX.ParsingOptions = {
    type: 'buffer',
    cellDates: true,
    cellText: true,
  };
  if (ext === '.csv') {
    opts.codepage = 65001;
  }
  try {
    return XLSX.read(buffer, opts);
  } catch {
    throw new Error('Failed to parse spreadsheet');
  }
}

export function listSheetNames(buffer: Buffer, filename: string): string[] {
  const wb = readWorkbook(buffer, filename);
  return (wb.SheetNames ?? []).filter((n) => typeof n === 'string' && n.length);
}

export function parseTableFile(
  buffer: Buffer,
  filename: string,
  sheetNames?: string[],
): { sheets: ParsedSheet[]; totalSheetCount: number } {
  const wb = readWorkbook(buffer, filename);
  const available = wb.SheetNames ?? [];
  const names = sheetNames?.length
    ? sheetNames.filter((n) => available.includes(n))
    : available;

  if (names.length === 0) {
    throw new Error('No matching sheets to import');
  }

  const sheets: ParsedSheet[] = [];
  for (const name of names) {
    const parsed = gridToParsedSheet(name, sheetToGrid(wb.Sheets[name]));
    if (parsed) sheets.push(parsed);
  }
  return { sheets, totalSheetCount: available.length };
}
