import {
  convertPropertyColumn,
  parseCheckbox,
  parseDate,
  parseNumber,
} from './property-type-conversion';

function ids() {
  let n = 0;
  return () => `opt${String(++n).padStart(3, '0')}`;
}

describe('convertPropertyColumn', () => {
  it('turns unique text values into select options and rewrites cells to option ids', () => {
    const result = convertPropertyColumn({
      fromType: 'text',
      toType: 'select',
      fromTypeOptions: {},
      toTypeOptions: {},
      cells: ['Active', 'Active', ' Draft ', '', null, 'Done'],
      generateChoiceId: ids(),
    });

    expect(result.typeOptions.choices).toEqual([
      expect.objectContaining({ id: 'opt001', name: 'Active' }),
      expect.objectContaining({ id: 'opt002', name: 'Draft' }),
      expect.objectContaining({ id: 'opt003', name: 'Done' }),
    ]);
    expect(result.cells).toEqual([
      'opt001',
      'opt001',
      'opt002',
      null,
      null,
      'opt003',
    ]);
  });

  it('splits comma-separated text into multi-select option ids', () => {
    const result = convertPropertyColumn({
      fromType: 'text',
      toType: 'multiSelect',
      fromTypeOptions: {},
      toTypeOptions: {},
      cells: ['red, blue', 'blue'],
      generateChoiceId: ids(),
    });

    expect(result.cells).toEqual([['opt001', 'opt002'], ['opt002']]);
    expect((result.typeOptions.choices as { name: string }[]).map((c) => c.name)).toEqual([
      'red',
      'blue',
    ]);
  });

  it('maps text onto existing status options by name and adds unmatched values', () => {
    const result = convertPropertyColumn({
      fromType: 'text',
      toType: 'status',
      fromTypeOptions: {},
      toTypeOptions: {
        choices: [
          { id: 'todo', name: 'Not started', color: 'gray', category: 'todo' },
          { id: 'doing', name: 'In progress', color: 'blue', category: 'inProgress' },
          { id: 'done', name: 'Done', color: 'green', category: 'complete' },
        ],
        choiceOrder: ['todo', 'doing', 'done'],
        defaultValue: 'todo',
      },
      cells: ['Done', 'Blocked', 'in progress'],
      generateChoiceId: ids(),
    });

    expect(result.cells).toEqual(['done', 'opt001', 'doing']);
    expect((result.typeOptions.choices as { name: string }[]).map((c) => c.name)).toEqual([
      'Not started',
      'In progress',
      'Done',
      'Blocked',
    ]);
  });

  it('converts select option ids back to names when targeting text', () => {
    const result = convertPropertyColumn({
      fromType: 'select',
      toType: 'text',
      fromTypeOptions: {
        choices: [{ id: 'a', name: 'Alpha', color: 'red' }],
        choiceOrder: ['a'],
      },
      toTypeOptions: {},
      cells: ['a', null],
      generateChoiceId: ids(),
    });

    expect(result.cells).toEqual(['Alpha', null]);
  });

  it('wraps select values as single-item multi-select lists', () => {
    const result = convertPropertyColumn({
      fromType: 'select',
      toType: 'multiSelect',
      fromTypeOptions: {
        choices: [{ id: 'a', name: 'Alpha', color: 'red' }],
        choiceOrder: ['a'],
      },
      toTypeOptions: {},
      cells: ['a', 'missing'],
      generateChoiceId: ids(),
    });

    expect(result.cells).toEqual([['a'], null]);
  });

  it('parses numeric text into numbers and clears invalid values', () => {
    const result = convertPropertyColumn({
      fromType: 'text',
      toType: 'number',
      fromTypeOptions: {},
      toTypeOptions: { separators: 'local' },
      cells: ['12', '1,234.5', 'nope', ''],
      generateChoiceId: ids(),
    });

    expect(result.cells).toEqual([12, 1234.5, null, null]);
  });
});

describe('parsers', () => {
  it('parseNumber understands grouped and european formats', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('abc')).toBeNull();
  });

  it('parseDate keeps ISO dates and accepts parseable strings', () => {
    expect(parseDate('2024-03-01')).toBe('2024-03-01');
    expect(parseDate('not a date')).toBeNull();
  });

  it('parseCheckbox coerces common truthy tokens', () => {
    expect(parseCheckbox('yes')).toBe(true);
    expect(parseCheckbox('0')).toBe(false);
    expect(parseCheckbox('maybe')).toBe(false);
    expect(parseCheckbox(null)).toBeNull();
  });
});
