// @ts-nocheck
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BasePropertyRepo } from '@snowind/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@snowind/db/repos/base/base-row.repo';
import { BaseViewRepo } from '@snowind/db/repos/base/base-view.repo';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { SpaceRepo } from '@snowind/db/repos/space/space.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import {
  BaseProperty,
  BaseRow,
  BaseView,
  Page,
  User,
  Workspace,
} from '@snowind/db/types/entity.types';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { v4 as uuid4 } from 'uuid';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { generateSlugId } from '../../common/helpers';
import { BaseWsService } from './realtime/base-ws.service';
import {
  isTableImportFile,
  getTableFileExtension,
  listSheetNames,
  parseTableFile,
} from './utils/table-import.parser';
import {
  isBaseViewVisibleToUser,
  isPrivateOwnedView,
  canMutateBaseView,
} from './view-access';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { sql } from 'kysely';

type Choice = {
  id: string;
  name: string;
  color: string;
  category?: 'todo' | 'inProgress' | 'complete';
};

type KanbanTemplate = 'kanban';

@Injectable()
export class BaseService {
  private readonly logger = new Logger(BaseService.name);
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly basePropertyRepo: BasePropertyRepo,
    private readonly baseRowRepo: BaseRowRepo,
    private readonly baseViewRepo: BaseViewRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly baseWs: BaseWsService,
  ) {}

  private genPosition(after?: string): string {
    return generateJitteredKeyBetween(after ?? null, null);
  }

  private genChoiceId(): string {
    return 'ch_' + uuid4();
  }

  private genPropertyId(): string {
    return 'prop' + uuid4().replace(/-/g, '').slice(0, 16);
  }

  private async assertPageWorkspace(pageId: string, workspaceId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    if (page.workspaceId !== workspaceId) {
      throw new BadRequestException('Workspace mismatch');
    }
    return page;
  }

  private async markPageAsBase(pageId: string, incrementVersion = true) {
    const existing = await this.pageRepo.findById(pageId);
    if (!existing) throw new NotFoundException('Page not found');
    const next = (existing.baseSchemaVersion ?? 0) + (incrementVersion ? 1 : 0);
    await this.db
      .updateTable('pages')
      .set({
        isBase: true,
        baseSchemaVersion: next,
        updatedAt: new Date(),
      })
      .where('id', '=', pageId)
      .execute();
    return next;
  }

  private broadcast(
    baseId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    this.baseWs.broadcastToBase(baseId, event, {
      ...payload,
      baseId,
      pageId: baseId,
    });
  }

  async getBaseInfo(pageId: string, workspaceId: string, user: User) {
    await this.assertPageWorkspace(pageId, workspaceId);
    const [page, properties, views] = await Promise.all([
      this.pageRepo.findById(pageId),
      this.basePropertyRepo.findByPageId(pageId),
      this.baseViewRepo.findByPageId(pageId),
    ]);

    return this.assembleBaseResponse(page, properties, views, user);
  }

  private assembleBaseResponse(
    page: Page,
    properties: BaseProperty[],
    views: BaseView[],
    user?: User,
  ) {
    return {
      id: page.id,
      slugId: page.slugId,
      name: page.title ?? 'Untitled',
      description: null,
      icon: page.icon ?? undefined,
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      creatorId: page.creatorId,
      properties,
      views: user
        ? views.filter((view) => isBaseViewVisibleToUser(view, user.id))
        : views.filter((view) => !isPrivateOwnedView(view)),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      baseSchemaVersion: page.baseSchemaVersion ?? 0,
      permissions: user
        ? { canEdit: true, hasRestriction: false }
        : undefined,
    };
  }

  async createBase(
    input: {
      name: string;
      description?: string;
      icon?: string;
      pageId?: string;
      spaceId: string;
    },
    workspaceId: string,
    user: User,
  ) {
    const space = await this.spaceRepo.findById(input.spaceId, workspaceId);
    if (!space) {
      throw new BadRequestException('Invalid space');
    }

    const pageId = input.pageId ?? uuid4();

    let page = await this.pageRepo.findById(pageId);
    if (!page) {
      page = await this.pageRepo.insertPage({
        id: pageId,
        slugId: uuid4(),
        spaceId: input.spaceId,
        workspaceId,
        creatorId: user.id,
        lastUpdatedById: user.id,
        title: input.name ?? 'Untitled base',
        icon: input.icon ?? null,
        position: this.genPosition(),
        isBase: false,
      });
    } else if (page.workspaceId !== workspaceId) {
      throw new BadRequestException('Workspace mismatch');
    }

    await this.initializeDefaultBase(pageId, workspaceId, user.id, false);
    await this.markPageAsBase(pageId, true);

    const properties = await this.basePropertyRepo.findByPageId(pageId);
    const views = await this.baseViewRepo.findByPageId(pageId);
    const refreshed = await this.pageRepo.findById(pageId);

    this.broadcast(pageId, 'base:created', { pageId });

    return this.assembleBaseResponse(refreshed, properties, views, user);
  }

  async convertPageToBase(
    pageId: string,
    template: KanbanTemplate | undefined,
    workspaceId: string,
    user: User,
  ) {
    await this.assertPageWorkspace(pageId, workspaceId);
    await this.initializeDefaultBase(
      pageId,
      workspaceId,
      user.id,
      template === 'kanban',
    );
    await this.markPageAsBase(pageId, true);

    const properties = await this.basePropertyRepo.findByPageId(pageId);
    const views = await this.baseViewRepo.findByPageId(pageId);
    const rows = await this.baseRowRepo.findByPageId(pageId);
    const page = await this.pageRepo.findById(pageId);

    this.broadcast(pageId, 'base:converted', { pageId, template });

    const resp = this.assembleBaseResponse(page, properties, views, user);
    return { ...resp, rows };
  }

  private async initializeDefaultBase(
    pageId: string,
    workspaceId: string,
    creatorId: string,
    withKanban: boolean,
  ) {
    const existingProps = await this.basePropertyRepo.findByPageId(pageId);
    if (existingProps.length > 0) return;

    const nameId = this.genPropertyId();
    const propsToInsert: any[] = [
      {
        id: nameId,
        pageId,
        name: 'Name',
        type: 'text',
        position: this.genPosition(),
        isPrimary: true,
        typeOptions: { richText: false, defaultValue: '' },
        pendingType: null,
        pendingTypeOptions: null,
        pendingToken: null,
        workspaceId,
      },
    ];

    let statusId: string | undefined;
    if (withKanban) {
      statusId = this.genPropertyId();
      const todo = this.genChoiceId();
      const inProgress = this.genChoiceId();
      const done = this.genChoiceId();
      const choices: Choice[] = [
        { id: todo, name: 'To Do', color: 'red', category: 'todo' },
        { id: inProgress, name: 'In Progress', color: 'yellow', category: 'inProgress' },
        { id: done, name: 'Done', color: 'green', category: 'complete' },
      ];
      propsToInsert.push({
        id: statusId,
        pageId,
        name: 'Status',
        type: 'status',
        position: this.genPosition(propsToInsert[propsToInsert.length - 1].position),
        isPrimary: false,
        typeOptions: {
          choices,
          choiceOrder: [todo, inProgress, done],
          defaultValue: todo,
        },
        pendingType: null,
        pendingTypeOptions: null,
        pendingToken: null,
        workspaceId,
      });
    }

    for (const p of propsToInsert) {
      await this.basePropertyRepo.insertProperty(p);
    }

    let rowPos = this.genPosition();
    if (withKanban && statusId) {
      const todoChoice = (
        propsToInsert.find((p) => p.id === statusId).typeOptions as any
      ).choices.find((c: Choice) => c.category === 'todo').id;
      const inProgressChoice = (
        propsToInsert.find((p) => p.id === statusId).typeOptions as any
      ).choices.find((c: Choice) => c.category === 'inProgress').id;
      const doneChoice = (
        propsToInsert.find((p) => p.id === statusId).typeOptions as any
      ).choices.find((c: Choice) => c.category === 'complete').id;

      const seedRows = [
        { name: 'Plan the work', status: todoChoice },
        { name: 'Do the work', status: inProgressChoice },
        { name: 'Ship the work', status: doneChoice },
      ];
      for (const row of seedRows) {
        await this.baseRowRepo.insertRow({
          pageId,
          workspaceId,
          creatorId,
          lastUpdatedById: creatorId,
          position: rowPos,
          cells: {
            [nameId]: row.name,
            [statusId]: row.status,
          } as any,
        });
        rowPos = this.genPosition(rowPos);
      }
    }

    const views = await this.baseViewRepo.findByPageId(pageId);
    let viewPos = views.length > 0 ? views[views.length - 1].position : undefined;

    if (!views.find((v) => v.type === 'table')) {
      viewPos = this.genPosition(viewPos);
      await this.baseViewRepo.insertView({
        pageId,
        workspaceId,
        creatorId,
        name: 'Table',
        type: 'table',
        position: viewPos,
        config: {} as any,
        isDefault: true,
        isPrivate: false,
      });
    }

    if (withKanban && !views.find((v) => v.type === 'kanban')) {
      viewPos = this.genPosition(viewPos);
      await this.baseViewRepo.insertView({
        pageId,
        workspaceId,
        creatorId,
        name: 'Kanban',
        type: 'kanban',
        position: viewPos,
        config: {
          groupByPropertyId: statusId,
          visiblePropertyIds: [nameId, statusId],
          propertyOrder: [nameId, statusId],
        } as any,
        isDefault: false,
        isPrivate: false,
      });
    }
  }

  async updateBase(
    input: { pageId: string; name?: string; description?: string; icon?: string },
    workspaceId: string,
    user?: User,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const updates: any = { updatedAt: new Date() };
    if (input.name !== undefined) updates.title = input.name;
    if (input.icon !== undefined) updates.icon = input.icon ?? null;
    await this.db
      .updateTable('pages')
      .set(updates)
      .where('id', '=', input.pageId)
      .execute();

    await this.markPageAsBase(input.pageId, true);
    const page = await this.pageRepo.findById(input.pageId);
    const properties = await this.basePropertyRepo.findByPageId(input.pageId);
    const views = await this.baseViewRepo.findByPageId(input.pageId);

    this.broadcast(input.pageId, 'base:schema:bumped', {
      pageId: input.pageId,
      schemaVersion: page.baseSchemaVersion ?? 0,
    });

    return this.assembleBaseResponse(page, properties, views, user);
  }

  async deleteBase(pageId: string, workspaceId: string) {
    await this.assertPageWorkspace(pageId, workspaceId);
    await this.db
      .updateTable('pages')
      .set({ isBase: false, deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', pageId)
      .execute();
    this.broadcast(pageId, 'base:deleted', { pageId });
  }

  async listBases(
    spaceId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    const limit = Math.min(
      Math.max(1, Number(pagination?.limit ?? 50) || 50),
      200,
    );
    const query = this.db
      .selectFrom('pages')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('isBase', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position COLLATE "C"`, 'asc')
      .orderBy('id', 'asc')
      .limit(limit);

    const pages = (await query.execute()) as Page[];

    const data: any[] = [];
    for (const page of pages) {
      const properties = await this.basePropertyRepo.findByPageId(page.id);
      const views = await this.baseViewRepo.findByPageId(page.id);
      data.push(this.assembleBaseResponse(page, properties, views));
    }
    return {
      items: data,
      meta: {
        limit,
        hasNextPage: pages.length >= limit,
        hasPrevPage: false,
        nextCursor: null,
        prevCursor: null,
      },
    };
  }

  async exportBaseToCsv(pageId: string, workspaceId: string, filter?: unknown) {
    await this.assertPageWorkspace(pageId, workspaceId);
    const properties = (
      await this.basePropertyRepo.findByPageId(pageId)
    ).sort((a, b) => {
      if (a.position === b.position) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
    const rows = await this.baseRowRepo.findByPageId(pageId, { filter });

    const header = properties.map((p) => p.name);
    const body = rows.map((r) =>
      properties.map((p) => {
        const cell = (r.cells as Record<string, unknown>)?.[p.id];
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
          return cell.toString();
        }
        try {
          return JSON.stringify(cell);
        } catch {
          return '';
        }
      }),
    );

    return csvStringify([header, ...body]);
  }

  // --- Properties ---

  async createProperty(
    input: {
      pageId: string;
      name: string;
      type: string;
      typeOptions?: any;
      requestId?: string;
    },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const existing = await this.basePropertyRepo.findByPageId(input.pageId);
    const lastPos = existing[existing.length - 1]?.position;

    const prop = await this.basePropertyRepo.insertProperty({
      id: this.genPropertyId(),
      pageId: input.pageId,
      name: input.name?.trim() ?? 'New property',
      type: input.type,
      position: this.genPosition(lastPos),
      typeOptions: input.typeOptions ?? {},
      pendingType: null,
      pendingTypeOptions: null,
      pendingToken: null,
      workspaceId,
      isPrimary: false,
    });

    const schemaVersion = await this.markPageAsBase(input.pageId, true);
    this.broadcast(input.pageId, 'base:property:created', {
      property: prop,
      schemaVersion,
      requestId: input.requestId,
    });
    return prop;
  }

  async updateProperty(
    input: {
      propertyId: string;
      pageId: string;
      name?: string;
      type?: string;
      typeOptions?: any;
      requestId?: string;
    },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const updates: any = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.type !== undefined) updates.type = input.type;
    if (input.typeOptions !== undefined) updates.typeOptions = input.typeOptions;
    const prop = await this.basePropertyRepo.updateProperty(
      input.propertyId,
      input.pageId,
      updates,
    );
    if (!prop) throw new NotFoundException('Property not found');
    const schemaVersion = await this.markPageAsBase(input.pageId, true);
    this.broadcast(input.pageId, 'base:property:updated', {
      property: prop,
      schemaVersion,
      requestId: input.requestId,
    });
    return { property: prop, jobId: null };
  }

  async deleteProperty(
    input: { propertyId: string; pageId: string; requestId?: string },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    await this.basePropertyRepo.softDeleteProperty(
      input.propertyId,
      input.pageId,
      workspaceId,
    );
    const schemaVersion = await this.markPageAsBase(input.pageId, true);
    this.broadcast(input.pageId, 'base:property:deleted', {
      propertyId: input.propertyId,
      schemaVersion,
      requestId: input.requestId,
    });
  }

  async reorderProperty(
    input: {
      propertyId: string;
      pageId: string;
      position: string;
      requestId?: string;
    },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const prop = await this.basePropertyRepo.updateProperty(
      input.propertyId,
      input.pageId,
      { position: input.position },
    );
    if (!prop) throw new NotFoundException('Property not found');
    const schemaVersion = await this.markPageAsBase(input.pageId, true);
    this.broadcast(input.pageId, 'base:property:reordered', {
      propertyId: input.propertyId,
      position: input.position,
      schemaVersion,
      requestId: input.requestId,
    });
  }

  // --- Rows ---

  async createRow(
    input: {
      pageId: string;
      cells?: Record<string, unknown>;
      afterRowId?: string;
      position?: string;
      requestId?: string;
    },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    let position = input.position;
    if (!position) {
      let afterPos: string | undefined;
      if (input.afterRowId) {
        const after = await this.baseRowRepo.findById(input.afterRowId);
        afterPos = after?.position;
      }
      position = this.genPosition(afterPos);
    }
    const row = await this.baseRowRepo.insertRow({
      pageId: input.pageId,
      workspaceId,
      creatorId: userId,
      lastUpdatedById: userId,
      position,
      cells: (input.cells as any) ?? {},
    });
    this.broadcast(input.pageId, 'base:row:created', {
      row,
      requestId: input.requestId,
    });
    return row;
  }

  async getRowInfo(rowId: string, pageId: string, workspaceId: string) {
    await this.assertPageWorkspace(pageId, workspaceId);
    const row = await this.baseRowRepo.findById(rowId);
    if (!row || row.pageId !== pageId) {
      throw new NotFoundException('Row not found');
    }
    return row;
  }

  async updateRow(
    input: {
      rowId: string;
      pageId: string;
      cells: Record<string, unknown>;
      position?: string;
      requestId?: string;
    },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    let row = await this.baseRowRepo.findById(input.rowId);
    if (!row || row.pageId !== input.pageId) {
      throw new NotFoundException('Row not found');
    }

    if (input.cells) {
      row = await this.baseRowRepo.updateRowCellsMerge(
        input.rowId,
        input.cells,
        userId,
      );
    }
    if (input.position && input.position !== row?.position) {
      row = await this.baseRowRepo.updateRow(input.rowId, {
        position: input.position,
        lastUpdatedById: userId,
      });
    }
    if (row) {
      this.broadcast(input.pageId, 'base:row:updated', {
        row,
        rowId: row.id,
        updatedCells: input.cells ?? {},
        requestId: input.requestId,
      });
    }
    return row;
  }

  async deleteRow(
    input: { rowId: string; pageId: string; requestId?: string },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    await this.baseRowRepo.softDeleteRow(input.rowId, input.pageId);
    this.broadcast(input.pageId, 'base:row:deleted', {
      rowId: input.rowId,
      requestId: input.requestId,
    });
  }

  async deleteRows(
    input: { rowIds: string[]; pageId: string; requestId?: string },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    await this.baseRowRepo.softDeleteRows(input.rowIds, input.pageId);
    this.broadcast(input.pageId, 'base:rows:deleted', {
      rowIds: input.rowIds,
      requestId: input.requestId,
    });
  }

  async listRows(
    pageId: string,
    workspaceId: string,
    pagination: PaginationOptions,
    params?: {
      sorts?: Array<{ propertyId: string; direction: 'asc' | 'desc' }>;
      filter?: unknown;
    },
  ) {
    await this.assertPageWorkspace(pageId, workspaceId);
    const rowsPage = await this.baseRowRepo.findByPageIdPaginated(
      pageId,
      pagination,
      params?.sorts,
      params?.filter,
    );
    return { ...rowsPage, references: { users: {}, pages: {} } };
  }

  async reorderRow(
    input: {
      rowId: string;
      pageId: string;
      position: string;
      requestId?: string;
    },
    workspaceId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const row = await this.baseRowRepo.updateRow(input.rowId, {
      position: input.position,
    });
    if (!row) throw new NotFoundException('Row not found');
    this.broadcast(input.pageId, 'base:row:reordered', {
      rowId: input.rowId,
      position: input.position,
      requestId: input.requestId,
    });
  }

  // --- Views ---

  async createView(
    input: {
      pageId: string;
      name: string;
      type?: string;
      config?: any;
      isPrivate?: boolean;
    },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const existing = await this.baseViewRepo.findByPageId(input.pageId);
    if (!existing.some((v) => v.isDefault || v.type === 'table')) {
      throw new BadRequestException('A shared table view is required first');
    }
    const lastPos = existing[existing.length - 1]?.position;
    const type = (input.type as any) ?? 'table';
    const view = await this.baseViewRepo.insertView({
      pageId: input.pageId,
      workspaceId,
      creatorId: userId,
      name: input.name ?? 'New view',
      type,
      position: this.genPosition(lastPos),
      config: input.config ?? {},
      isDefault: false,
      isPrivate: !!input.isPrivate,
    });
    this.broadcast(input.pageId, 'base:view:created', { view });
    return view;
  }

  async updateView(
    input: {
      viewId: string;
      pageId: string;
      name?: string;
      type?: string;
      config?: any;
      position?: string;
      isPrivate?: boolean;
    },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const current = await this.baseViewRepo.findById(input.viewId);
    if (!current || current.pageId !== input.pageId) {
      throw new NotFoundException('View not found');
    }
    if (!canMutateBaseView(current, userId)) {
      throw new ForbiddenException('You cannot edit this view');
    }
    if (current.isDefault) {
      if (input.type && input.type !== 'table') {
        throw new BadRequestException('The shared table view cannot change type');
      }
      if (input.position !== undefined) {
        throw new BadRequestException('The shared table view cannot be reordered');
      }
      if (input.isPrivate) {
        throw new BadRequestException('The shared table view cannot be private');
      }
    }
    if (
      input.isPrivate !== undefined &&
      current.creatorId !== userId
    ) {
      throw new ForbiddenException('Only the creator can change view visibility');
    }

    const updates: any = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.type !== undefined) updates.type = input.type as any;
    if (input.config !== undefined) {
      const existingCfg = (current.config as any) ?? {};
      const patch = input.config ?? {};
      const merged: any = { ...existingCfg };
      for (const key of Object.keys(patch)) {
        const v = patch[key];
        if (v === null || v === undefined) delete merged[key];
        else merged[key] = v;
      }
      updates.config = merged;
    }
    if (input.position !== undefined) updates.position = input.position;
    if (input.isPrivate !== undefined) updates.isPrivate = input.isPrivate;

    const view = await this.baseViewRepo.updateView(
      input.viewId,
      input.pageId,
      updates,
    );
    if (!view) throw new NotFoundException('View not found');
    this.broadcast(input.pageId, 'base:view:updated', { view });
    return view;
  }

  async deleteView(
    input: { viewId: string; pageId: string },
    workspaceId: string,
    userId: string,
  ) {
    await this.assertPageWorkspace(input.pageId, workspaceId);
    const current = await this.baseViewRepo.findById(input.viewId);
    if (!current || current.pageId !== input.pageId) {
      throw new NotFoundException('View not found');
    }
    if (current.isDefault) {
      throw new BadRequestException('The shared table view cannot be deleted');
    }
    if (!canMutateBaseView(current, userId)) {
      throw new ForbiddenException('You cannot delete this view');
    }
    await this.baseViewRepo.deleteView(input.viewId, input.pageId);
    this.broadcast(input.pageId, 'base:view:deleted', { viewId: input.viewId });
  }

  async listViews(pageId: string, workspaceId: string, userId: string) {
    await this.assertPageWorkspace(pageId, workspaceId);
    const views = await this.baseViewRepo.findByPageId(pageId);
    return views.filter((view) => isBaseViewVisibleToUser(view, userId));
  }

  // --- Table import ---

  private async getNewPagePosition(spaceId: string): Promise<string> {
    const lastPage = await this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('parentPageId', 'is', null)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1)
      .executeTakeFirst();

    if (lastPage?.position) {
      return generateJitteredKeyBetween(lastPage.position, null);
    }
    return generateJitteredKeyBetween(null, null);
  }

  listTableSheets(buffer: Buffer, filename: string): { sheets: string[] } {
    if (!isTableImportFile(filename)) {
      throw new BadRequestException('Invalid import file type.');
    }
    try {
      return { sheets: listSheetNames(buffer, filename) };
    } catch (err: any) {
      this.logger.error('Failed to list spreadsheet sheets', err);
      throw new BadRequestException(
        err?.message || 'Failed to parse spreadsheet',
      );
    }
  }

  async importTable(
    buffer: Buffer,
    filename: string,
    sheetNames: string[] | undefined,
    spaceId: string,
    workspaceId: string,
    user: User,
  ): Promise<Page[]> {
    if (!isTableImportFile(filename)) {
      throw new BadRequestException('Invalid import file type.');
    }

    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new BadRequestException('Invalid space');
    }

    let parsed;
    try {
      parsed = parseTableFile(buffer, filename, sheetNames);
    } catch (err: any) {
      this.logger.error('Failed to parse spreadsheet', err);
      throw new BadRequestException(
        err?.message || 'Failed to parse spreadsheet',
      );
    }

    if (parsed.sheets.length === 0) {
      throw new BadRequestException(
        'No data to import from the selected sheets',
      );
    }

    const ext = getTableFileExtension(filename);
    const displayName =
      (ext ? filename.slice(0, filename.length - ext.length) : filename).trim() ||
      'Untitled base';
    let pagePosition = await this.getNewPagePosition(spaceId);
    const createdPages: Page[] = [];

    for (const sheet of parsed.sheets) {
      const title =
        parsed.totalSheetCount === 1
          ? displayName
          : sheet.name?.trim() || displayName;

      const page = await this.pageRepo.insertPage({
        slugId: generateSlugId(),
        spaceId,
        workspaceId,
        creatorId: user.id,
        lastUpdatedById: user.id,
        title,
        position: pagePosition,
        isBase: true,
        baseSchemaVersion: 1,
      });

      const propertyIds: string[] = [];
      const headerIds: string[] = [];
      let propPos: string | undefined;
      for (let i = 0; i < sheet.headers.length; i++) {
        const propId = this.genPropertyId();
        headerIds.push(propId);
        propertyIds.push(propId);
        propPos = this.genPosition(propPos);
        await this.basePropertyRepo.insertProperty({
          id: propId,
          pageId: page.id,
          name: sheet.headers[i],
          type: 'text',
          position: propPos,
          isPrimary: i === 0,
          typeOptions: { richText: false, defaultValue: '' },
          pendingType: null,
          pendingTypeOptions: null,
          pendingToken: null,
          workspaceId,
        });
      }

      const rowInserts = [];
      let rowPos = this.genPosition();
      for (let r = 0; r < sheet.rows.length; r++) {
        const cells: Record<string, unknown> = {};
        for (let c = 0; c < headerIds.length; c++) {
          const value = sheet.rows[r][c] ?? '';
          cells[headerIds[c]] = value;
        }
        rowInserts.push({
          pageId: page.id,
          workspaceId,
          creatorId: user.id,
          lastUpdatedById: user.id,
          position: rowPos,
          cells,
        });
        rowPos = this.genPosition(rowPos);
      }
      await this.baseRowRepo.insertRows(rowInserts);

      await this.baseViewRepo.insertView({
        pageId: page.id,
        workspaceId,
        creatorId: user.id,
        name: 'Table',
        type: 'table',
        position: this.genPosition(),
        config: {
          propertyOrder: propertyIds,
          visiblePropertyIds: propertyIds,
        } as any,
        isDefault: true,
        isPrivate: false,
      });

      this.broadcast(page.id, 'base:created', { pageId: page.id });
      createdPages.push(page);
      pagePosition = generateJitteredKeyBetween(pagePosition, null);
    }

    return createdPages;
  }
}
