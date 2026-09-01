import * as XLSX from 'xlsx';
import {
  gridToParsedSheet,
  listSheetNames,
  parseTableFile,
  sheetToGrid,
} from './table-import.parser';

function workbookBuffer(
  sheets: Array<{
    name: string;
    data: unknown[][];
    merges?: XLSX.Range[];
  }>,
  bookType: XLSX.BookType = 'xlsx',
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    if (sheet.merges) ws['!merges'] = sheet.merges;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType }));
}

describe('sheetToGrid', () => {
  it('fills every cell in a merged range with the origin value', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Team A', '', 'Score'],
      ['', '', '10'],
      ['Team B', 'x', '8'],
    ]);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }];

    expect(sheetToGrid(ws)).toEqual([
      ['Team A', 'Team A', 'Score'],
      ['Team A', 'Team A', '10'],
      ['Team B', 'x', '8'],
    ]);
  });

  it('trims empty trailing rows and columns', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['A', 'B', ''],
      ['1', '2', ''],
      ['', '', ''],
    ]);
    expect(sheetToGrid(ws)).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });
});

describe('gridToParsedSheet', () => {
  it('uses the first row as headers and skips blank data rows', () => {
    const parsed = gridToParsedSheet('Tasks', [
      ['Title', 'Owner'],
      ['Plan', 'Ada'],
      ['', ''],
      ['Ship', 'Lin'],
    ]);
    expect(parsed).toEqual({
      name: 'Tasks',
      headers: ['Title', 'Owner'],
      rows: [
        ['Plan', 'Ada'],
        ['Ship', 'Lin'],
      ],
    });
  });

  it('dedupes headers and fills blank header names', () => {
    const parsed = gridToParsedSheet('S', [
      ['No.', '', 'Name', 'Name'],
      ['a', 'b', 'c', 'd'],
    ]);
    expect(parsed?.headers).toEqual([
      'No.',
      'Column 2',
      'Name',
      'Name (2)',
    ]);
  });

  it('returns null for an empty grid', () => {
    expect(gridToParsedSheet('Empty', [])).toBeNull();
  });
});

describe('parseTableFile', () => {
  it('lists and parses multiple sheets', () => {
    const buf = workbookBuffer([
      { name: 'Alpha', data: [['H'], ['1']] },
      { name: 'Beta', data: [['X'], ['y']] },
    ]);
    expect(listSheetNames(buf, 'wb.xlsx')).toEqual(['Alpha', 'Beta']);

    const parsed = parseTableFile(buf, 'wb.xlsx', ['Beta']);
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.totalSheetCount).toBe(2);
    expect(parsed.sheets[0].name).toBe('Beta');
    expect(parsed.sheets[0].headers).toEqual(['X']);
    expect(parsed.sheets[0].rows).toEqual([['y']]);
  });

  it('expands merges when parsing a workbook buffer', () => {
    const buf = workbookBuffer([
      {
        name: 'Merged',
        data: [
          ['Region', '', 'Q1'],
          ['', '', '100'],
        ],
        merges: [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }],
      },
    ]);
    const parsed = parseTableFile(buf, 'm.xlsx');
    expect(parsed.sheets[0].headers).toEqual(['Region', 'Region (2)', 'Q1']);
    expect(parsed.sheets[0].rows).toEqual([['Region', 'Region', '100']]);
  });

  it('parses csv as a single sheet', () => {
    const csv = Buffer.from('Name,Age\nAda,36\nLin,21\n');
    const parsed = parseTableFile(csv, 'people.csv');
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.sheets[0].headers).toEqual(['Name', 'Age']);
    expect(parsed.sheets[0].rows).toEqual([
      ['Ada', '36'],
      ['Lin', '21'],
    ]);
  });

  it('imports every data row beyond the first 100', () => {
    const data = [['Name'], ...Array.from({ length: 250 }, (_, i) => [`R${i + 1}`])];
    const buf = workbookBuffer([{ name: 'All', data }]);
    const parsed = parseTableFile(buf, 'big.xlsx');
    expect(parsed.sheets[0].rows).toHaveLength(250);
    expect(parsed.sheets[0].rows[0]).toEqual(['R1']);
    expect(parsed.sheets[0].rows[249]).toEqual(['R250']);
  });
});
