import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { dbOrTx } from '@snowind/db/utils';
import {
  BaseRow,
  InsertableBaseRow,
  UpdatableBaseRow,
} from '@snowind/db/types/entity.types';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import {
  Expression,
  ExpressionBuilder,
  SelectQueryBuilder,
  sql,
  SqlBool,
} from 'kysely';

type FilterCondition = {
    propertyId: string;
    op: string;
    value?: unknown;
  };

  type FilterGroup = {
    op: 'and' | 'or';
    children: Array<FilterCondition | FilterGroup>;
  };

  type FilterNode = FilterCondition | FilterGroup;

  function isFilterGroup(node: FilterNode): node is FilterGroup {
    return 'children' in node && Array.isArray(node.children);
  }

  function cellText(propId: string) {
    return sql<string>`base_cell_text(cells, ${sql.lit(propId)})`;
  }

  function cellRaw(propId: string) {
    return sql`cells->${sql.lit(propId)}`;
  }

  function cellJsonbTypeof(propId: string) {
    return sql<string>`jsonb_typeof(cells->${sql.lit(propId)})`;
  }

  function likeEscape(val: string): string {
    return val.replace(/[%_\\]/g, '\\$&');
  }

  function jsonContains(propertyId: string, v: string) {
    return sql<SqlBool>`(cells->${sql.lit(propertyId)} @> ${sql.lit(JSON.stringify(v))}::jsonb OR cells->${sql.lit(propertyId)} = ${sql.lit(JSON.stringify(v))}::jsonb)`;
  }

  function buildCondition(
    eb: ExpressionBuilder<any, any>,
    cond: FilterCondition,
  ): Expression<SqlBool> {
    const { propertyId, op } = cond;
    const value = cond.value;
    const col = cellText(propertyId);

    const isEmptyExpr = eb.or([
      eb(eb.val(null), '=', cellRaw(propertyId)),
      eb(cellJsonbTypeof(propertyId), '=', 'null'),
      eb(col, '=', ''),
    ]);
    const isNotEmptyExpr = eb.not(isEmptyExpr);

    switch (op) {
      case 'eq': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '=', v);
      }
      case 'neq': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb.not(eb(col, '=', v));
      }
      case 'gt': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '>', v);
      }
      case 'gte': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '>=', v);
      }
      case 'lt': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '<', v);
      }
      case 'lte': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '<=', v);
      }
      case 'contains': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, 'like', `%${likeEscape(v)}%`);
      }
      case 'ncontains': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, 'not like', `%${likeEscape(v)}%`);
      }
      case 'startsWith': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, 'like', `${likeEscape(v)}%`);
      }
      case 'endsWith': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, 'like', `%${likeEscape(v)}`);
      }
      case 'isEmpty':
        return isEmptyExpr;
      case 'isNotEmpty':
        return isNotEmptyExpr;
      case 'before': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '<', v);
      }
      case 'after': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '>', v);
      }
      case 'onOrBefore': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '<=', v);
      }
      case 'onOrAfter': {
        const v = value === null || value === undefined ? '' : String(value);
        return eb(col, '>=', v);
      }
      case 'any': {
        const arr = Array.isArray(value) ? value : value ? [value] : [];
        if (arr.length === 0) return eb(eb.val(1), '=', 0);
        const values = arr.map((v) => String(v));
        return eb.or(values.map((v) => jsonContains(propertyId, v)));
      }
      case 'none': {
        const arr = Array.isArray(value) ? value : value ? [value] : [];
        if (arr.length === 0) return eb(eb.val(1), '=', 1);
        const values = arr.map((v) => String(v));
        const conds = values.map((v) => jsonContains(propertyId, v));
        return eb.not(eb.or(conds));
      }
      case 'all': {
        const arr = Array.isArray(value) ? value : value ? [value] : [];
        if (arr.length === 0) return eb(eb.val(1), '=', 1);
        const values = arr.map((v) => String(v));
        const jsonArr = JSON.stringify(values);
        return sql<SqlBool>`cells->${sql.lit(propertyId)} @> ${sql.lit(jsonArr)}::jsonb`;
      }
      case 'isWithin': {
        if (!value || typeof value !== 'object') return eb(eb.val(1), '=', 1);
        const v = value as any;
        if (v.mode === 'range' && v.preset) {
          const { start, end } = resolveRangePreset(v.preset);
          if (start && end) {
            return eb.and([eb(col, '>=', start), eb(col, '<=', end)]);
          }
        }
        return eb(eb.val(1), '=', 1);
      }
      default:
        return eb(eb.val(1), '=', 1);
    }
  }

  function resolveRangePreset(preset: string): { start: string; end: string } | null {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    switch (preset) {
      case 'pastWeek':
        start.setDate(start.getDate() - 7);
        break;
      case 'pastMonth':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'pastYear':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'thisWeek': {
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'thisMonth':
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
        break;
      case 'thisYear':
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
      case 'nextWeek':
        end.setDate(end.getDate() + 7);
        break;
      case 'nextMonth':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'nextYear':
        end.setFullYear(end.getFullYear() + 1);
        break;
      default:
        return null;
    }
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  function applyFilter<DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
    filter: FilterNode,
  ): SelectQueryBuilder<DB, TB, O> {
    return qb.where((eb) => buildFilterNode(eb, filter));
  }

  function buildFilterNode(
    eb: ExpressionBuilder<any, any>,
    node: FilterNode,
  ): Expression<SqlBool> {
    if (isFilterGroup(node)) {
      if (node.children.length === 0) {
        return eb(eb.val(1), '=', 1);
      }
      const exprs = node.children.map((c) => buildFilterNode(eb, c));
      return node.op === 'and' ? eb.and(exprs) : eb.or(exprs);
    }
    return buildCondition(eb, node);
  }

  function normalizeFilter(filter: unknown): FilterNode | undefined {
    if (!filter || typeof filter !== 'object') return undefined;
    const f = filter as FilterNode;
    if (isFilterGroup(f) && f.children.length === 0) return undefined;
    return f;
  }

@Injectable()
export class BaseRowRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof BaseRow> = [
    'id',
    'pageId',
    'cells',
    'position',
    'creatorId',
    'lastUpdatedById',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    id: string,
    opts?: { trx?: KyselyTransaction; includeDeleted?: boolean },
  ): Promise<BaseRow | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    let query = db
      .selectFrom('baseRows')
      .select(this.baseFields)
      .where('id', '=', id);

    if (!opts?.includeDeleted) {
      query = query.where('deletedAt', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async findByPageIdPaginated(
    pageId: string,
    pagination: PaginationOptions,
    sorts?: Array<{ propertyId: string; direction: 'asc' | 'desc' }>,
    filter?: unknown,
    opts?: { trx?: KyselyTransaction },
  ) {
    const db = dbOrTx(this.db, opts?.trx);
    let query: any = db
      .selectFrom('baseRows')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null);

    const normalizedFilter = normalizeFilter(filter);
    if (normalizedFilter) {
      query = applyFilter(query, normalizedFilter);
    }

    if (sorts && sorts.length > 0) {
      for (const sort of sorts) {
        const { propertyId, direction } = sort;
        query = query.orderBy(
          sql`base_cell_text(cells, ${propertyId})`,
          direction,
        );
      }
    }

    query = query.orderBy(sql`position COLLATE "C"`, 'asc').orderBy('id', 'asc');

    const limit = Math.min(
      Math.max(1, Number(pagination?.limit ?? 50) || 50),
      200,
    );
    const rows = await query.limit(limit).execute();

    return {
      items: rows,
      meta: {
        limit,
        hasNextPage: rows.length >= limit,
        hasPrevPage: false,
        nextCursor: null,
        prevCursor: null,
      },
    };
  }

  async findByPageId(
    pageId: string,
    opts?: { trx?: KyselyTransaction; limit?: number; filter?: unknown },
  ): Promise<BaseRow[]> {
    const db = dbOrTx(this.db, opts?.trx);
    let query: any = db
      .selectFrom('baseRows')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null);

    const normalizedFilter = normalizeFilter(opts?.filter);
    if (normalizedFilter) {
      query = applyFilter(query, normalizedFilter);
    }

    query = query
      .orderBy(sql`position COLLATE "C"`, 'asc')
      .orderBy('id', 'asc');

    if (opts?.limit) {
      query = query.limit(opts.limit);
    }

    return query.execute();
  }

  async insertRow(
    insertable: InsertableBaseRow,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseRow> {
    const db = dbOrTx(this.db, opts?.trx);
    const clean: any = {};
    for (const k of Object.keys(insertable)) {
      const v = (insertable as any)[k];
      clean[k] = v === undefined ? null : v;
    }
    return db
      .insertInto('baseRows')
      .values(clean)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async insertRows(
    insertables: InsertableBaseRow[],
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    if (!insertables.length) return;
    const db = dbOrTx(this.db, opts?.trx);
    const batchSize = 200;
    for (let i = 0; i < insertables.length; i += batchSize) {
      const chunk = insertables.slice(i, i + batchSize).map((insertable) => {
        const clean: any = {};
        for (const k of Object.keys(insertable)) {
          const v = (insertable as any)[k];
          clean[k] = v === undefined ? null : v;
        }
        return clean;
      });
      await db.insertInto('baseRows').values(chunk).execute();
    }
  }

  async updateRow(
    id: string,
    data: UpdatableBaseRow,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseRow | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .updateTable('baseRows')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateRowCellsMerge(
    id: string,
    patches: Record<string, unknown>,
    lastUpdatedById?: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseRow | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    const updater: any = {
      cells: sql`jsonb_set_many(cells, ${sql.lit(JSON.stringify(patches))}::jsonb)`,
      updatedAt: new Date(),
    };
    if (lastUpdatedById) {
      updater.lastUpdatedById = lastUpdatedById;
    }
    return db
      .updateTable('baseRows')
      .set(updater)
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDeleteRow(
    id: string,
    pageId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .updateTable('baseRows')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async softDeleteRows(
    rowIds: string[],
    pageId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    if (!rowIds || rowIds.length === 0) return;
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .updateTable('baseRows')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', 'in', rowIds)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .execute();
  }
}
