type Choice = { id: string; name: string };

type PropertyLike = {
  id: string;
  type: string;
  typeOptions?: unknown;
};

type UserRef = { id: string; name: string | null };
type PageRef = { id: string; title: string | null };

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
    out.push({ id: c.id, name: c.name });
  }
  return out;
}

function choiceName(opts: Record<string, unknown>, id: string): string | undefined {
  return parseChoices(opts).find((c) => c.id === id)?.name;
}

function personIds(cell: unknown): string[] {
  if (Array.isArray(cell)) {
    return cell.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  return typeof cell === 'string' && cell ? [cell] : [];
}

function parseFiles(
  cell: unknown,
): Array<{ id: string; fileName: string }> {
  if (!Array.isArray(cell)) return [];
  return cell.filter(
    (f): f is { id: string; fileName: string } =>
      !!f &&
      typeof f === 'object' &&
      typeof (f as { id?: unknown }).id === 'string' &&
      typeof (f as { fileName?: unknown }).fileName === 'string',
  );
}

function formatAutoNumber(
  cell: unknown,
  opts: Record<string, unknown>,
): string {
  const n = parseAutoNumberCell(cell);
  if (n == null) return '';
  return formatAutoNumberValue(n, {
    prefix: typeof opts.prefix === 'string' ? opts.prefix : '',
    digits: typeof opts.digits === 'number' ? opts.digits : 4,
  });
}

function parseAutoNumberCell(cell: unknown): number | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return Math.trunc(cell);
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const match = trimmed.match(/(\d+)\s*$/);
    if (match) return Number(match[1]);
  }
  return null;
}

export function collectReferenceIds(
  properties: PropertyLike[],
  rows: Array<{ cells?: unknown; creatorId?: string; lastUpdatedById?: string | null }>,
): { userIds: string[]; pageIds: string[] } {
  const userIds = new Set<string>();
  const pageIds = new Set<string>();
  const byId = new Map(properties.map((p) => [p.id, p]));

  for (const row of rows) {
    if (row.creatorId) userIds.add(row.creatorId);
    if (row.lastUpdatedById) userIds.add(row.lastUpdatedById);
    const cells = (row.cells as Record<string, unknown>) ?? {};
    for (const [propId, value] of Object.entries(cells)) {
      const prop = byId.get(propId);
      if (!prop || value == null) continue;
      if (prop.type === 'person' || prop.type === 'lastEditedBy') {
        for (const id of personIds(value)) userIds.add(id);
      } else if (prop.type === 'page' && typeof value === 'string') {
        pageIds.add(value);
      }
    }
  }

  return { userIds: Array.from(userIds), pageIds: Array.from(pageIds) };
}

export function formatCellForExport(
  property: PropertyLike,
  cell: unknown,
  refs: {
    users: Record<string, UserRef>;
    pages: Record<string, PageRef>;
  },
  row?: { createdAt?: Date | string; updatedAt?: Date | string; creatorId?: string; lastUpdatedById?: string | null },
): string {
  const opts = asRecord(property.typeOptions);

  if (property.type === 'createdAt') {
    const v = row?.createdAt;
    return v ? new Date(v).toISOString() : '';
  }
  if (property.type === 'lastEditedAt') {
    const v = row?.updatedAt;
    return v ? new Date(v).toISOString() : '';
  }
  if (property.type === 'lastEditedBy') {
    const id = row?.lastUpdatedById ?? row?.creatorId;
    if (!id) return '';
    return refs.users[id]?.name ?? id;
  }

  if (cell === null || cell === undefined) return '';

  switch (property.type) {
    case 'select':
    case 'status': {
      if (typeof cell !== 'string') return '';
      return choiceName(opts, cell) ?? cell;
    }
    case 'multiSelect': {
      const ids = Array.isArray(cell)
        ? cell.filter((v): v is string => typeof v === 'string')
        : typeof cell === 'string'
          ? [cell]
          : [];
      return ids.map((id) => choiceName(opts, id) ?? id).join(', ');
    }
    case 'person': {
      return personIds(cell)
        .map((id) => refs.users[id]?.name ?? id)
        .join(', ');
    }
    case 'page': {
      if (typeof cell !== 'string' || !cell) return '';
      const page = refs.pages[cell];
      return page?.title?.trim() || cell;
    }
    case 'file': {
      return parseFiles(cell)
        .map((f) => f.fileName)
        .filter(Boolean)
        .join(', ');
    }
    case 'checkbox': {
      if (cell === true) return 'true';
      if (cell === false) return 'false';
      return '';
    }
    case 'autoNumber':
    case 'sequence': {
      return formatAutoNumber(cell, opts);
    }
    case 'formula': {
      if (
        cell &&
        typeof cell === 'object' &&
        !Array.isArray(cell) &&
        '__err' in (cell as object)
      ) {
        return '';
      }
      if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
        return String(cell);
      }
      try {
        return JSON.stringify(cell);
      } catch {
        return '';
      }
    }
    default: {
      if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
        return String(cell);
      }
      try {
        return JSON.stringify(cell);
      } catch {
        return '';
      }
    }
  }
}

export function formatAutoNumberValue(
  n: number,
  opts: { prefix?: string; digits?: number },
): string {
  const prefix = typeof opts.prefix === 'string' ? opts.prefix : '';
  const digits =
    typeof opts.digits === 'number' && opts.digits > 0
      ? Math.min(Math.floor(opts.digits), 12)
      : 4;
  return `${prefix}${String(Math.trunc(n)).padStart(digits, '0')}`;
}
