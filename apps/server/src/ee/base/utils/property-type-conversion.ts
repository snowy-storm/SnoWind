export const CHOICE_COLORS = [
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const;

export const TEXT_CHAR_LIMIT = 1000;
export const MAX_CHOICES = 500;
export const MAX_CHOICE_NAME = 100;

export type Choice = {
  id: string;
  name: string;
  color: string;
  category?: 'todo' | 'inProgress' | 'complete';
};

const CHOICE_TYPES = new Set(['select', 'status', 'multiSelect']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const TRUE_TOKENS = new Set([
  'true',
  'yes',
  'y',
  '1',
  'checked',
  'on',
]);
const FALSE_TOKENS = new Set([
  'false',
  'no',
  'n',
  '0',
  'unchecked',
  'off',
]);

export type ConvertColumnInput = {
  fromType: string;
  toType: string;
  fromTypeOptions: unknown;
  toTypeOptions: unknown;
  cells: unknown[];
  generateChoiceId: () => string;
};

export type ConvertColumnResult = {
  typeOptions: Record<string, unknown>;
  cells: unknown[];
};

type SelectTypeOptions = {
  choices: Choice[];
  choiceOrder: string[];
  disableColors?: boolean;
  defaultValue?: string | string[] | null;
};

export function convertPropertyColumn(
  input: ConvertColumnInput,
): ConvertColumnResult {
  const { fromType, toType, cells, generateChoiceId } = input;
  const fromOpts = asRecord(input.fromTypeOptions);
  const toOpts = asRecord(input.toTypeOptions);

  if (fromType === toType) {
    return { typeOptions: toOpts, cells: [...cells] };
  }

  if (CHOICE_TYPES.has(fromType) && CHOICE_TYPES.has(toType)) {
    const typeOptions = carryChoiceOptions(fromOpts, toOpts, toType);
    return {
      typeOptions,
      cells: cells.map((cell) =>
        convertBetweenChoiceTypes(cell, fromType, toType, typeOptions.choices),
      ),
    };
  }

  if (CHOICE_TYPES.has(toType)) {
    const built = buildChoicesFromCells({
      fromType,
      fromOpts,
      toOpts,
      toType,
      cells,
      generateChoiceId,
    });
    const labelToId = labelLookup(built.choices);
    return {
      typeOptions: built,
      cells: cells.map((cell) =>
        labelsToChoiceValue(
          cellLabels(cell, fromType, fromOpts, toType === 'multiSelect'),
          toType,
          labelToId,
        ),
      ),
    };
  }

  return {
    typeOptions: toOpts,
    cells: cells.map((cell) =>
      convertNonChoiceCell(cell, fromType, toType, fromOpts),
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseChoices(opts: Record<string, unknown>): Choice[] {
  const raw = opts.choices;
  if (!Array.isArray(raw)) return [];
  const out: Choice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Choice;
    if (typeof c.id !== 'string' || typeof c.name !== 'string') continue;
    out.push({
      id: c.id,
      name: c.name,
      color: typeof c.color === 'string' ? c.color : 'gray',
      ...(c.category ? { category: c.category } : {}),
    });
  }
  return out;
}

function carryChoiceOptions(
  fromOpts: Record<string, unknown>,
  toOpts: Record<string, unknown>,
  toType: string,
): SelectTypeOptions {
  const source = parseChoices(toOpts).length ? toOpts : fromOpts;
  const choices = parseChoices(source);
  const orderRaw = source.choiceOrder;
  const choiceOrder = Array.isArray(orderRaw)
    ? (orderRaw as unknown[]).filter(
        (id): id is string =>
          typeof id === 'string' && choices.some((c) => c.id === id),
      )
    : choices.map((c) => c.id);
  for (const c of choices) {
    if (!choiceOrder.includes(c.id)) choiceOrder.push(c.id);
  }
  const carried: SelectTypeOptions = { choices, choiceOrder };
  if (source.disableColors === true) carried.disableColors = true;
  if (toType === 'status') {
    const def = source.defaultValue;
    carried.defaultValue =
      typeof def === 'string' && choices.some((c) => c.id === def)
        ? def
        : (choices[0]?.id ?? null);
  } else if (source.defaultValue !== undefined) {
    carried.defaultValue = source.defaultValue as SelectTypeOptions['defaultValue'];
  }
  return carried;
}

function convertBetweenChoiceTypes(
  cell: unknown,
  fromType: string,
  toType: string,
  choices: Choice[],
): unknown {
  const ids = choiceIdsFromCell(cell, fromType).filter((id) =>
    choices.some((c) => c.id === id),
  );
  if (toType === 'multiSelect') return ids.length ? ids : null;
  return ids[0] ?? null;
}

function choiceIdsFromCell(cell: unknown, fromType: string): string[] {
  if (fromType === 'multiSelect') {
    if (Array.isArray(cell)) {
      return cell.filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
    return typeof cell === 'string' && cell ? [cell] : [];
  }
  return typeof cell === 'string' && cell ? [cell] : [];
}

function buildChoicesFromCells(input: {
  fromType: string;
  fromOpts: Record<string, unknown>;
  toOpts: Record<string, unknown>;
  toType: string;
  cells: unknown[];
  generateChoiceId: () => string;
}): SelectTypeOptions {
  const choices = parseChoices(input.toOpts);
  const seenNames = new Map<string, string>();
  for (const c of choices) {
    seenNames.set(c.name, c.id);
    const lower = c.name.toLowerCase();
    if (!seenNames.has(lower)) seenNames.set(lower, c.id);
  }

  const splitForMulti = input.toType === 'multiSelect';
  for (const cell of input.cells) {
    if (choices.length >= MAX_CHOICES) break;
    for (const label of cellLabels(
      cell,
      input.fromType,
      input.fromOpts,
      splitForMulti,
    )) {
      if (choices.length >= MAX_CHOICES) break;
      if (seenNames.has(label) || seenNames.has(label.toLowerCase())) continue;
      const id = input.generateChoiceId();
      const color = CHOICE_COLORS[choices.length % CHOICE_COLORS.length];
      const choice: Choice = { id, name: label, color };
      const category = inferStatusCategory(label);
      if (input.toType === 'status' && category) choice.category = category;
      choices.push(choice);
      seenNames.set(label, id);
      seenNames.set(label.toLowerCase(), id);
    }
  }

  const orderRaw = input.toOpts.choiceOrder;
  const choiceOrder = Array.isArray(orderRaw)
    ? (orderRaw as unknown[]).filter(
        (id): id is string =>
          typeof id === 'string' && choices.some((c) => c.id === id),
      )
    : [];
  for (const c of choices) {
    if (!choiceOrder.includes(c.id)) choiceOrder.push(c.id);
  }

  const result: SelectTypeOptions = { choices, choiceOrder };
  if (input.toOpts.disableColors === true) result.disableColors = true;
  if (input.toType === 'status') {
    const def = input.toOpts.defaultValue;
    result.defaultValue =
      typeof def === 'string' && choices.some((c) => c.id === def)
        ? def
        : (choices[0]?.id ?? null);
  }
  return result;
}

function inferStatusCategory(
  name: string,
): Choice['category'] | undefined {
  const n = name.trim().toLowerCase();
  if (['todo', 'to do', 'to-do', 'not started', 'backlog'].includes(n)) {
    return 'todo';
  }
  if (['in progress', 'doing', 'started', 'wip'].includes(n)) {
    return 'inProgress';
  }
  if (['done', 'complete', 'completed', 'finished'].includes(n)) {
    return 'complete';
  }
  return undefined;
}

function labelLookup(choices: Choice[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of choices) {
    if (!map.has(c.name)) map.set(c.name, c.id);
    const lower = c.name.toLowerCase();
    if (!map.has(lower)) map.set(lower, c.id);
  }
  return map;
}

function labelsToChoiceValue(
  labels: string[],
  toType: string,
  labelToId: Map<string, string>,
): unknown {
  const ids: string[] = [];
  for (const label of labels) {
    const id = labelToId.get(label) ?? labelToId.get(label.toLowerCase());
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (toType === 'multiSelect') return ids.length ? ids : null;
  return ids[0] ?? null;
}

function cellLabels(
  cell: unknown,
  fromType: string,
  fromOpts: Record<string, unknown>,
  splitCommas: boolean,
): string[] {
  const raw = rawLabels(cell, fromType, fromOpts);
  const out: string[] = [];
  for (const item of raw) {
    const parts = splitCommas
      ? item.split(',').map((p) => p.trim())
      : [item.trim()];
    for (const part of parts) {
      if (!part) continue;
      const name = part.slice(0, MAX_CHOICE_NAME);
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

function rawLabels(
  cell: unknown,
  fromType: string,
  fromOpts: Record<string, unknown>,
): string[] {
  if (cell == null || cell === '') return [];
  if (isFormulaError(cell)) return [];

  if (fromType === 'select' || fromType === 'status') {
    if (typeof cell !== 'string') return [];
    const name = choiceName(fromOpts, cell) ?? cell;
    return name ? [name] : [];
  }
  if (fromType === 'multiSelect') {
    const ids = choiceIdsFromCell(cell, 'multiSelect');
    return ids
      .map((id) => choiceName(fromOpts, id) ?? id)
      .filter((name) => name.length > 0);
  }
  if (fromType === 'number') {
    return typeof cell === 'number' && Number.isFinite(cell) ? [String(cell)] : [];
  }
  if (fromType === 'checkbox') {
    if (cell === true) return ['true'];
    if (cell === false) return ['false'];
    return [];
  }
  if (fromType === 'file') {
    return parseFiles(cell).map((f) => f.fileName).filter(Boolean);
  }
  if (fromType === 'person') {
    return personIds(cell);
  }
  if (Array.isArray(cell)) {
    return cell
      .map((v) => (v == null ? '' : String(v)))
      .filter((s) => s.length > 0);
  }
  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    const s = String(cell);
    return s.length ? [s] : [];
  }
  return [];
}

function choiceName(
  opts: Record<string, unknown>,
  id: string,
): string | undefined {
  return parseChoices(opts).find((c) => c.id === id)?.name;
}

function convertNonChoiceCell(
  cell: unknown,
  fromType: string,
  toType: string,
  fromOpts: Record<string, unknown>,
): unknown {
  if (cell == null || cell === '') return null;
  if (isFormulaError(cell)) return null;

  if (toType === 'text' || toType === 'longText') {
    const text = stringifyCell(cell, fromType, fromOpts);
    if (!text) return null;
    return toType === 'text' ? text.slice(0, TEXT_CHAR_LIMIT) : text;
  }

  if (toType === 'number') {
    if (fromType === 'select' || fromType === 'status') {
      const name =
        typeof cell === 'string' ? (choiceName(fromOpts, cell) ?? cell) : null;
      return parseNumber(name);
    }
    if (fromType === 'multiSelect') {
      const first = choiceIdsFromCell(cell, 'multiSelect')[0];
      const name = first ? (choiceName(fromOpts, first) ?? first) : null;
      return parseNumber(name);
    }
    return parseNumber(cell);
  }

  if (toType === 'date') {
    if (fromType === 'select' || fromType === 'status') {
      const name =
        typeof cell === 'string' ? (choiceName(fromOpts, cell) ?? cell) : null;
      return parseDate(name);
    }
    return parseDate(cell);
  }

  if (toType === 'checkbox') return parseCheckbox(cell);

  if (toType === 'url') {
    const text = stringifyCell(cell, fromType, fromOpts);
    return parseUrl(text);
  }

  if (toType === 'email') {
    const text = stringifyCell(cell, fromType, fromOpts);
    return parseEmail(text);
  }

  if (toType === 'person') {
    const ids = personIds(cell).filter((id) => UUID_RE.test(id));
    return ids.length ? ids : null;
  }

  if (toType === 'page') {
    if (typeof cell === 'string' && UUID_RE.test(cell)) return cell;
    return null;
  }

  if (toType === 'file') {
    const files = parseFiles(cell);
    return files.length ? files : null;
  }

  return null;
}

function stringifyCell(
  cell: unknown,
  fromType: string,
  fromOpts: Record<string, unknown>,
): string | null {
  const labels = cellLabels(cell, fromType, fromOpts, false);
  if (!labels.length) return null;
  return labels.join(', ');
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;
  s = s.replace(/[%\s]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toIsoDateUtc(d);
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const probe = new Date(`${iso[1]}T00:00:00Z`);
    return Number.isNaN(probe.getTime()) ? null : iso[1];
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return toIsoDateLocal(d);
}

function toIsoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseCheckbox(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (TRUE_TOKENS.has(s)) return true;
  if (FALSE_TOKENS.has(s)) return false;
  return false;
}

function parseUrl(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return s;
  } catch {
    return null;
  }
}

function parseEmail(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  return EMAIL_RE.test(s) ? s : null;
}

function personIds(cell: unknown): string[] {
  if (Array.isArray(cell)) {
    return cell.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  return typeof cell === 'string' && cell ? [cell] : [];
}

function parseFiles(
  cell: unknown,
): Array<{ id: string; fileName: string; mimeType?: string; fileSize?: number; url?: string }> {
  if (!Array.isArray(cell)) return [];
  return cell.filter(
    (f): f is { id: string; fileName: string } =>
      !!f &&
      typeof f === 'object' &&
      typeof (f as { id?: unknown }).id === 'string' &&
      typeof (f as { fileName?: unknown }).fileName === 'string',
  );
}

function isFormulaError(cell: unknown): boolean {
  return (
    !!cell &&
    typeof cell === 'object' &&
    !Array.isArray(cell) &&
    '__err' in (cell as Record<string, unknown>)
  );
}

export function cellValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
