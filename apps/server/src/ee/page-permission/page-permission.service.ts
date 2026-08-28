import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { PagePermissionRepo } from '@snowind/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@snowind/db/repos/space/space-member.repo';
import { GroupRepo } from '@snowind/db/repos/group/group.repo';
import { GroupUserRepo } from '@snowind/db/repos/group/group-user.repo';
import { ShareRepo } from '@snowind/db/repos/share/share.repo';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { emptyCursorPaginationResult } from '@snowind/db/pagination/cursor-pagination';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import {
  InsertablePagePermission,
  Page,
  User,
} from '@snowind/db/types/entity.types';
import { executeTx } from '@snowind/db/utils';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../common/helpers/types/permission';
import { getPageTitle } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { IPermissionGrantedNotificationJob } from '../../integrations/queue/constants/queue.interface';
import { WsService } from '../../ws/ws.service';
import {
  AddPagePermissionDto,
  RemovePagePermissionDto,
  UpdatePagePermissionDto,
} from './dto/page-permission.dto';

@Injectable()
export class PagePermissionService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly groupRepo: GroupRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly shareRepo: ShareRepo,
    private readonly wsService: WsService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async getRestrictionInfo(pageId: string, user: User) {
    const page = await this.requirePage(pageId);
    await this.pageAccessService.validateCanView(page, user);

    const access = await this.pagePermissionRepo.getUserPageAccessLevel(
      user.id,
      page.id,
    );
    const pageAccess = access.hasDirectRestriction
      ? await this.pagePermissionRepo.findPageAccessByPageId(page.id)
      : undefined;

    let inheritedFrom:
      | { id: string; slugId: string; title: string }
      | undefined;
    if (access.hasInheritedRestriction) {
      const source =
        await this.pagePermissionRepo.findInheritedRestrictionSource(page.id);
      if (source) {
        inheritedFrom = {
          id: source.id,
          slugId: source.slugId,
          title: getPageTitle(source.title),
        };
      }
    }

    const canManage = await this.canManagePage(page, user, access);

    return {
      restrictionId: pageAccess?.id,
      hasDirectRestriction: access.hasDirectRestriction,
      hasInheritedRestriction: access.hasInheritedRestriction,
      inheritedFrom,
      userAccess: {
        canView: true,
        canEdit: await this.resolveCanEdit(page, user, access),
        canManage,
      },
    };
  }

  async getPermissions(pageId: string, pagination: PaginationOptions, user: User) {
    const page = await this.requirePage(pageId);
    await this.pageAccessService.validateCanView(page, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      return emptyCursorPaginationResult(pagination.limit);
    }

    return this.pagePermissionRepo.getPagePermissionsPaginated(
      pageAccess.id,
      pagination,
    );
  }

  async restrictPage(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertCanManage(page, user);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (existing) {
      throw new BadRequestException('Page is already restricted');
    }

    await executeTx(this.db, async (trx) => {
      const pageAccess = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: PageAccessLevel.RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );
      if (!pageAccess) {
        throw new BadRequestException('Failed to restrict page');
      }

      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: pageAccess.id,
            userId: user.id,
            role: PagePermissionRole.WRITER,
            addedById: user.id,
          },
        ],
        trx,
      );
    });

    const share = await this.shareRepo.findByPageId(page.id);
    if (share) {
      await this.shareRepo.deleteShare(share.id);
    }

    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { title: getPageTitle(page.title), accessLevel: 'restricted' },
      },
    });
  }

  async unrestrictPage(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertCanManage(page, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new BadRequestException('Page is not restricted');
    }

    await this.pagePermissionRepo.deletePageAccess(page.id);
    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        before: { title: getPageTitle(page.title), accessLevel: 'restricted' },
      },
    });
  }

  async addPermission(dto: AddPagePermissionDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertCanManage(page, user);

    const userIds = uniqueIds(dto.userIds);
    const groupIds = uniqueIds(dto.groupIds);
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('Provide at least one user or group');
    }

    const pageAccess = await this.requireDirectAccess(page.id);
    await this.assertSpaceMembers(page, userIds, groupIds);

    const toInsert: InsertablePagePermission[] = [];

    for (const userId of userIds) {
      const existing = await this.pagePermissionRepo.findPagePermissionByUserId(
        pageAccess.id,
        userId,
      );
      if (!existing) {
        toInsert.push({
          pageAccessId: pageAccess.id,
          userId,
          role: dto.role,
          addedById: user.id,
        });
      }
    }

    for (const groupId of groupIds) {
      const existing =
        await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccess.id,
          groupId,
        );
      if (!existing) {
        toInsert.push({
          pageAccessId: pageAccess.id,
          groupId,
          role: dto.role,
          addedById: user.id,
        });
      }
    }

    if (toInsert.length === 0) {
      return;
    }

    await this.pagePermissionRepo.insertPagePermissions(toInsert);

    const notifyUserIds = new Set(userIds);
    for (const groupId of groupIds) {
      const members = await this.groupUserRepo.getUserIdsByGroupId(groupId);
      for (const memberId of members) {
        notifyUserIds.add(memberId);
      }
    }
    notifyUserIds.delete(user.id);

    if (notifyUserIds.size > 0) {
      const jobData: IPermissionGrantedNotificationJob = {
        userIds: Array.from(notifyUserIds),
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        role: dto.role,
      };
      await this.notificationQueue.add(QueueJob.PAGE_PERMISSION_GRANTED, jobData);
    }

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_ADDED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        role: dto.role,
        userIds,
        groupIds,
      },
    });
  }

  async removePermission(dto: RemovePagePermissionDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertCanManage(page, user);

    const userIds = uniqueIds(dto.userIds);
    const groupIds = uniqueIds(dto.groupIds);
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('Provide at least one user or group');
    }

    const pageAccess = await this.requireDirectAccess(page.id);
    await this.assertNotLastWriter(pageAccess.id, { userIds, groupIds });

    if (userIds.length > 0) {
      await this.pagePermissionRepo.deletePagePermissionsByUserIds(
        pageAccess.id,
        userIds,
      );
    }
    if (groupIds.length > 0) {
      await this.pagePermissionRepo.deletePagePermissionsByGroupIds(
        pageAccess.id,
        groupIds,
      );
    }

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        userIds,
        groupIds,
      },
    });
  }

  async updatePermission(dto: UpdatePagePermissionDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertCanManage(page, user);

    if (!dto.userId && !dto.groupId) {
      throw new BadRequestException('Provide a userId or groupId');
    }

    const pageAccess = await this.requireDirectAccess(page.id);

    const existing = dto.userId
      ? await this.pagePermissionRepo.findPagePermissionByUserId(
          pageAccess.id,
          dto.userId,
        )
      : await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccess.id,
          dto.groupId,
        );

    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    if (
      existing.role === PagePermissionRole.WRITER &&
      dto.role === PagePermissionRole.READER
    ) {
      await this.assertNotLastWriter(pageAccess.id, {
        userIds: dto.userId ? [dto.userId] : [],
        groupIds: dto.groupId ? [dto.groupId] : [],
      });
    }

    await this.pagePermissionRepo.updatePagePermissionRole(
      pageAccess.id,
      dto.role,
      { userId: dto.userId, groupId: dto.groupId },
    );
  }

  private async requirePage(pageId: string, rejectDeleted = false): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || (rejectDeleted && page.deletedAt)) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async requireDirectAccess(pageId: string) {
    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      pageId,
    );
    if (!pageAccess) {
      throw new BadRequestException('Page is not restricted');
    }
    return pageAccess;
  }

  private async resolveCanEdit(
    page: Page,
    user: User,
    access: {
      hasAnyRestriction: boolean;
      canEdit: boolean;
    },
  ): Promise<boolean> {
    if (access.hasAnyRestriction) {
      return access.canEdit;
    }
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    return ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  }

  private async canManagePage(
    page: Page,
    user: User,
    access: {
      hasAnyRestriction: boolean;
      canEdit: boolean;
    },
  ): Promise<boolean> {
    return this.resolveCanEdit(page, user, access);
  }

  private async assertCanManage(page: Page, user: User): Promise<void> {
    await this.pageAccessService.validateCanView(page, user);
    const access = await this.pagePermissionRepo.getUserPageAccessLevel(
      user.id,
      page.id,
    );
    const canManage = await this.canManagePage(page, user, access);
    if (!canManage) {
      throw new ForbiddenException();
    }
  }

  private async assertSpaceMembers(
    page: Page,
    userIds: string[],
    groupIds: string[],
  ): Promise<void> {
    if (userIds.length > 0) {
      const allowed = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
        userIds,
        page.spaceId,
      );
      if (allowed.size !== userIds.length) {
        throw new BadRequestException(
          'All users must be members of this space',
        );
      }
    }

    for (const groupId of groupIds) {
      const group = await this.groupRepo.findById(groupId, page.workspaceId);
      if (!group) {
        throw new BadRequestException('Group not found');
      }
      const membership = await this.spaceMemberRepo.getSpaceMemberByTypeId(
        page.spaceId,
        { groupId },
      );
      if (!membership) {
        throw new BadRequestException(
          'All groups must be members of this space',
        );
      }
    }
  }

  private async assertNotLastWriter(
    pageAccessId: string,
    removing: { userIds: string[]; groupIds: string[] },
  ): Promise<void> {
    let remaining =
      await this.pagePermissionRepo.countWritersByPageAccessId(pageAccessId);

    for (const userId of removing.userIds) {
      const permission =
        await this.pagePermissionRepo.findPagePermissionByUserId(
          pageAccessId,
          userId,
        );
      if (permission?.role === PagePermissionRole.WRITER) {
        remaining -= 1;
      }
    }
    for (const groupId of removing.groupIds) {
      const permission =
        await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccessId,
          groupId,
        );
      if (permission?.role === PagePermissionRole.WRITER) {
        remaining -= 1;
      }
    }

    if (remaining <= 0) {
      throw new BadRequestException(
        'Cannot remove the last person with edit access',
      );
    }
  }
}

function uniqueIds(ids?: string[]): string[] {
  return Array.from(new Set((ids ?? []).filter(Boolean)));
}
