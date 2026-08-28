import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { DB } from '@snowind/db/types/db';
import { executeWithCursorPagination } from '@snowind/db/pagination/cursor-pagination';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  ActorType,
  AuditLogPayload,
  AuditResource,
  EXCLUDED_AUDIT_EVENTS,
} from '../../common/events/audit-events';
import { getPageTitle } from '../../common/helpers';
import { ListAuditLogsDto } from './dto/audit.dto';

const DEFAULT_AUDIT_RETENTION_DAYS = 365;

type AuditResourceInfo = {
  id: string;
  name: string;
  slug?: string;
  slugId?: string;
};

@Injectable()
export class AuditService implements IAuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly cls: ClsService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  log(payload: AuditLogPayload): Promise<void> {
    const context = this.getContextFromCls();
    return this.logWithContext(payload, context);
  }

  async logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
  ): Promise<void> {
    if (EXCLUDED_AUDIT_EVENTS.has(payload.event)) {
      return;
    }

    try {
      if (!context.workspaceId) {
        this.logger.warn('workspaceId missing, skipping audit log');
        return;
      }

      await this.db
        .insertInto('audit')
        .values({
          workspaceId: context.workspaceId,
          actorId: context.actorId ?? null,
          actorType: context.actorType ?? 'user',
          event: payload.event,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId ?? null,
          spaceId: payload.spaceId ?? null,
          ipAddress: context.ipAddress ?? null,
          changes: payload.changes ?? null,
          metadata: payload.metadata ?? null,
        })
        .execute();
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  async logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): Promise<void> {
    const rowsToInsert = payloads.filter(
      (payload) => !EXCLUDED_AUDIT_EVENTS.has(payload.event),
    );
    if (rowsToInsert.length === 0) return;

    try {
      if (!context.workspaceId) {
        this.logger.warn('workspaceId missing, skipping audit log batch');
        return;
      }

      const rows = rowsToInsert.map((payload) => ({
        workspaceId: context.workspaceId,
        actorId: context.actorId ?? null,
        actorType: context.actorType ?? 'user',
        event: payload.event,
        resourceType: payload.resourceType,
        resourceId: payload.resourceId ?? null,
        spaceId: payload.spaceId ?? null,
        ipAddress: context.ipAddress ?? null,
        changes: payload.changes ?? null,
        metadata: payload.metadata ?? null,
      }));

      await this.db
        .insertInto('audit')
        .values(rows)
        .execute();
    } catch (err) {
      this.logger.error('Failed to write audit log batch', err);
    }
  }

  setActorId(actorId: string): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (context) {
      context.actorId = actorId;
      this.cls.set(AUDIT_CONTEXT_KEY, context);
    }
  }

  setActorType(actorType: ActorType): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (context) {
      context.actorType = actorType;
      this.cls.set(AUDIT_CONTEXT_KEY, context);
    }
  }

  async listLogs(workspaceId: string, dto: ListAuditLogsDto) {
    let query = this.db
      .selectFrom('audit')
      .select([
        'audit.id',
        'audit.workspaceId',
        'audit.actorId',
        'audit.actorType',
        'audit.event',
        'audit.resourceType',
        'audit.resourceId',
        'audit.spaceId',
        'audit.changes',
        'audit.metadata',
        'audit.ipAddress',
        'audit.createdAt',
      ])
      .select((eb) => this.withActor(eb))
      .where('audit.workspaceId', '=', workspaceId);

    if (EXCLUDED_AUDIT_EVENTS.size > 0) {
      query = query.where(
        'audit.event',
        'not in',
        [...EXCLUDED_AUDIT_EVENTS],
      );
    }

    if (dto.event) {
      query = query.where('audit.event', '=', dto.event);
    }

    if (dto.resourceType) {
      query = query.where('audit.resourceType', '=', dto.resourceType);
    }

    if (dto.actorId) {
      query = query.where('audit.actorId', '=', dto.actorId);
    }

    if (dto.spaceId) {
      query = query.where('audit.spaceId', '=', dto.spaceId);
    }

    if (dto.startDate) {
      query = query.where('audit.createdAt', '>=', new Date(dto.startDate));
    }

    if (dto.endDate) {
      query = query.where('audit.createdAt', '<=', new Date(dto.endDate));
    }

    const result = await executeWithCursorPagination(query, {
      perPage: dto.limit,
      cursor: dto.cursor,
      beforeCursor: dto.beforeCursor,
      fields: [
        { expression: 'audit.createdAt', direction: 'desc', key: 'createdAt' },
        { expression: 'audit.id', direction: 'desc', key: 'id' },
      ],
      parseCursor: (cursor) => ({
        createdAt: new Date(cursor.createdAt),
        id: cursor.id,
      }),
    });

    const items = await this.attachResources(workspaceId, result.items);

    return {
      ...result,
      items,
    };
  }

  async getRetention(workspaceId: string): Promise<{ retentionDays: number }> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return {
      retentionDays:
        workspace?.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS,
    };
  }

  async updateRetention(
    workspaceId: string,
    retentionDays: number,
  ): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({
        auditRetentionDays: retentionDays,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .execute();
  }

  @Interval('audit-cleanup', 24 * 60 * 60 * 1000)
  async cleanupExpiredLogs(): Promise<void> {
    try {
      this.logger.debug('Starting audit log cleanup');

      const workspaces = await this.db
        .selectFrom('workspaces')
        .select(['id', 'auditRetentionDays'])
        .where('deletedAt', 'is', null)
        .execute();

      let totalDeleted = 0;

      for (const workspace of workspaces) {
        const retentionDays =
          workspace.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        const deleted = await this.db
          .deleteFrom('audit')
          .where('workspaceId', '=', workspace.id)
          .where('createdAt', '<', cutoff)
          .executeTakeFirst();

        totalDeleted += Number(deleted.numDeletedRows ?? 0);
      }

      this.logger.debug(
        totalDeleted > 0
          ? `Audit cleanup completed: ${totalDeleted} logs deleted`
          : 'No expired audit logs to clean up',
      );
    } catch (error) {
      this.logger.error(
        'Audit cleanup job failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private withActor(eb: ExpressionBuilder<DB, 'audit'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'audit.actorId'),
    ).as('actor');
  }

  private async attachResources<
    T extends {
      resourceType: string;
      resourceId: string | null;
      spaceId: string | null;
      changes: unknown;
      metadata: unknown;
    },
  >(workspaceId: string, items: T[]): Promise<(T & { resource: AuditResourceInfo | null })[]> {
    const idsByType = new Map<string, Set<string>>();

    const addId = (type: string, id?: string | null) => {
      if (!id) return;
      const set = idsByType.get(type) ?? new Set<string>();
      set.add(id);
      idsByType.set(type, set);
    };

    for (const item of items) {
      addId(item.resourceType, item.resourceId);
      if (item.resourceType === AuditResource.SPACE_MEMBER) {
        addId(AuditResource.SPACE, item.resourceId ?? item.spaceId);
      }
      if (item.spaceId) {
        addId(AuditResource.SPACE, item.spaceId);
      }
    }

    const resources = new Map<string, AuditResourceInfo>();
    const key = (type: string, id: string) => `${type}:${id}`;

    const pageIds = [
      ...(idsByType.get(AuditResource.PAGE) ?? []),
    ];
    if (pageIds.length > 0) {
      const pages = await this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId', 'isBase', 'drawingType'])
        .where('workspaceId', '=', workspaceId)
        .where('id', 'in', pageIds)
        .execute();
      for (const page of pages) {
        resources.set(key(AuditResource.PAGE, page.id), {
          id: page.id,
          name: getPageTitle(page.title, page.isBase, page.drawingType),
          slugId: page.slugId,
        });
      }
    }

    const spaceIds = [...(idsByType.get(AuditResource.SPACE) ?? [])];
    if (spaceIds.length > 0) {
      const spaces = await this.db
        .selectFrom('spaces')
        .select(['id', 'name', 'slug'])
        .where('workspaceId', '=', workspaceId)
        .where('id', 'in', spaceIds)
        .execute();
      for (const space of spaces) {
        const info = {
          id: space.id,
          name: space.name ?? space.slug,
          slug: space.slug,
        };
        resources.set(key(AuditResource.SPACE, space.id), info);
        resources.set(key(AuditResource.SPACE_MEMBER, space.id), info);
      }
    }

    const groupIds = [...(idsByType.get(AuditResource.GROUP) ?? [])];
    if (groupIds.length > 0) {
      const groups = await this.db
        .selectFrom('groups')
        .select(['id', 'name'])
        .where('workspaceId', '=', workspaceId)
        .where('id', 'in', groupIds)
        .execute();
      for (const group of groups) {
        resources.set(key(AuditResource.GROUP, group.id), {
          id: group.id,
          name: group.name,
        });
      }
    }

    const userIds = [...(idsByType.get(AuditResource.USER) ?? [])];
    if (userIds.length > 0) {
      const users = await this.db
        .selectFrom('users')
        .select(['id', 'name', 'email'])
        .where('workspaceId', '=', workspaceId)
        .where('id', 'in', userIds)
        .execute();
      for (const user of users) {
        resources.set(key(AuditResource.USER, user.id), {
          id: user.id,
          name: user.name ?? user.email,
        });
      }
    }

    const workspaceIds = [...(idsByType.get(AuditResource.WORKSPACE) ?? [])];
    if (workspaceIds.length > 0) {
      const workspaces = await this.db
        .selectFrom('workspaces')
        .select(['id', 'name'])
        .where('id', 'in', workspaceIds)
        .execute();
      for (const workspace of workspaces) {
        resources.set(key(AuditResource.WORKSPACE, workspace.id), {
          id: workspace.id,
          name: workspace.name,
        });
      }
    }

    const shareIds = [...(idsByType.get(AuditResource.SHARE) ?? [])];
    if (shareIds.length > 0) {
      const shares = await this.db
        .selectFrom('shares')
        .leftJoin('pages', 'pages.id', 'shares.pageId')
        .select([
          'shares.id',
          'pages.title',
          'pages.slugId',
          'pages.isBase',
          'pages.drawingType',
        ])
        .where('shares.workspaceId', '=', workspaceId)
        .where('shares.id', 'in', shareIds)
        .execute();
      for (const share of shares) {
        resources.set(key(AuditResource.SHARE, share.id), {
          id: share.id,
          name: getPageTitle(share.title, share.isBase, share.drawingType),
          slugId: share.slugId ?? undefined,
        });
      }
    }

    const commentIds = [...(idsByType.get(AuditResource.COMMENT) ?? [])];
    if (commentIds.length > 0) {
      const comments = await this.db
        .selectFrom('comments')
        .leftJoin('pages', 'pages.id', 'comments.pageId')
        .select([
          'comments.id',
          'pages.title',
          'pages.slugId',
          'pages.isBase',
          'pages.drawingType',
        ])
        .where('comments.workspaceId', '=', workspaceId)
        .where('comments.id', 'in', commentIds)
        .execute();
      for (const comment of comments) {
        resources.set(key(AuditResource.COMMENT, comment.id), {
          id: comment.id,
          name: getPageTitle(comment.title, comment.isBase, comment.drawingType),
          slugId: comment.slugId ?? undefined,
        });
      }
    }

    return items.map((item) => ({
      ...item,
      resource: this.resolveResource(item, resources, key),
    }));
  }

  private resolveResource(
    item: {
      resourceType: string;
      resourceId: string | null;
      spaceId: string | null;
      changes: unknown;
      metadata: unknown;
    },
    resources: Map<string, AuditResourceInfo>,
    key: (type: string, id: string) => string,
  ): AuditResourceInfo | null {
    if (item.resourceId) {
      const matched =
        resources.get(key(item.resourceType, item.resourceId)) ??
        (item.resourceType === AuditResource.SPACE_MEMBER
          ? resources.get(key(AuditResource.SPACE, item.resourceId))
          : undefined);
      if (matched) return matched;
    }

    if (item.spaceId) {
      const space = resources.get(key(AuditResource.SPACE, item.spaceId));
      if (space) return space;
    }

    const fallbackName = this.fallbackResourceName(item.changes, item.metadata);
    if (item.resourceId && fallbackName) {
      return { id: item.resourceId, name: fallbackName };
    }

    return null;
  }

  private fallbackResourceName(
    changes: unknown,
    metadata: unknown,
  ): string | undefined {
    const after =
      changes && typeof changes === 'object'
        ? (changes as { after?: Record<string, unknown> }).after
        : undefined;
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : undefined;

    const candidates = [
      after?.name,
      after?.title,
      after?.email,
      meta?.spaceName,
      meta?.userName,
      meta?.name,
      meta?.title,
    ];

    return candidates.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  }

  private getContextFromCls(): AuditLogContext {
    const ctx = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    return {
      workspaceId: ctx?.workspaceId ?? '',
      actorId: ctx?.actorId ?? undefined,
      actorType: ctx?.actorType ?? undefined,
      ipAddress: ctx?.ipAddress ?? undefined,
      userAgent: ctx?.userAgent ?? undefined,
    };
  }
}
