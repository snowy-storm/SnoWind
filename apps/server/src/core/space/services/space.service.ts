import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSpaceDto } from '../dto/create-space.dto';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { SpaceRepo } from '@snowind/db/repos/space/space.repo';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { Space, User, Workspace } from '@snowind/db/types/entity.types';
import { UpdateSpaceDto } from '../dto/update-space.dto';
import { executeTx } from '@snowind/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { SpaceMemberService } from './space-member.service';
import { SpaceRole } from '../../../common/helpers/types/permission';
import { QueueJob, QueueName } from 'src/integrations/queue/constants';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { CursorPaginationResult } from '@snowind/db/pagination/cursor-pagination';
import { ShareRepo } from '@snowind/db/repos/share/share.repo';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  diffAuditTrackedFields,
  generateRandomSuffixNumbers,
} from '../../../common/helpers';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

@Injectable()
export class SpaceService {
  constructor(
    private spaceRepo: SpaceRepo,
    private spaceMemberService: SpaceMemberService,
    private shareRepo: ShareRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async createSpace(
    authUser: User,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
    options?: { isPersonal?: boolean },
  ): Promise<Space> {
    let space = null;

    await executeTx(
      this.db,
      async (trx) => {
        space = await this.create(
          authUser.id,
          workspaceId,
          createSpaceDto,
          trx,
          options,
        );

        await this.spaceMemberService.addUserToSpace(
          authUser.id,
          space.id,
          SpaceRole.ADMIN,
          workspaceId,
          trx,
        );
      },
      trx,
    );

    this.auditService.log({
      event: AuditEvent.SPACE_CREATED,
      resourceType: AuditResource.SPACE,
      resourceId: space.id,
      spaceId: space.id,
      changes: {
        after: {
          name: space.name,
          slug: space.slug,
          ...(space.isPersonal ? { isPersonal: true } : {}),
        },
      },
    });

    return { ...space, memberCount: 1 };
  }

  async create(
    userId: string,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
    options?: { isPersonal?: boolean },
  ): Promise<Space> {
    const slugExists = await this.spaceRepo.slugExists(
      createSpaceDto.slug,
      workspaceId,
      trx,
    );
    if (slugExists) {
      throw new BadRequestException(
        'Space slug exists. Please use a unique space slug',
      );
    }

    return await this.spaceRepo.insertSpace(
      {
        name: createSpaceDto.name ?? 'untitled space',
        description: createSpaceDto.description ?? '',
        creatorId: userId,
        workspaceId: workspaceId,
        slug: createSpaceDto.slug,
        isPersonal: options?.isPersonal ?? false,
      },
      trx,
    );
  }

  async updateSpace(
    updateSpaceDto: UpdateSpaceDto,
    workspaceId: string,
  ): Promise<Space> {
    if (updateSpaceDto?.slug) {
      const slugExists = await this.spaceRepo.slugExists(
        updateSpaceDto.slug,
        workspaceId,
      );

      if (slugExists) {
        throw new BadRequestException(
          'Space slug exists. Please use a unique space slug',
        );
      }
    }

    const spaceBefore = await this.spaceRepo.findById(
      updateSpaceDto.spaceId,
      workspaceId,
    );
    const settingsBefore = (spaceBefore?.settings ?? {}) as Record<string, any>;

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    let updatedSpace: Space;

    await executeTx(this.db, async (trx) => {
      if (typeof updateSpaceDto.disablePublicSharing !== 'undefined') {
        const prev = settingsBefore?.sharing?.disabled ?? false;
        if (prev !== updateSpaceDto.disablePublicSharing) {
          before.disablePublicSharing = prev;
          after.disablePublicSharing = updateSpaceDto.disablePublicSharing;
        }

        await this.spaceRepo.updateSharingSettings(
          updateSpaceDto.spaceId,
          workspaceId,
          'disabled',
          updateSpaceDto.disablePublicSharing,
          trx,
        );

        if (updateSpaceDto.disablePublicSharing) {
          await this.shareRepo.deleteBySpaceId(updateSpaceDto.spaceId, trx);
        }
      }

      if (typeof updateSpaceDto.allowViewerComments !== 'undefined') {
        const prev = settingsBefore?.comments?.allowViewerComments ?? false;
        if (prev !== updateSpaceDto.allowViewerComments) {
          before.allowViewerComments = prev;
          after.allowViewerComments = updateSpaceDto.allowViewerComments;
        }

        await this.spaceRepo.updateCommentSettings(
          updateSpaceDto.spaceId,
          workspaceId,
          'allowViewerComments',
          updateSpaceDto.allowViewerComments,
          trx,
        );
      }

      updatedSpace = await this.spaceRepo.updateSpace(
        {
          name: updateSpaceDto.name,
          description: updateSpaceDto.description,
          slug: updateSpaceDto.slug,
        },
        updateSpaceDto.spaceId,
        workspaceId,
        trx,
      );
    });

    const columnChanges = diffAuditTrackedFields(
      ['name', 'slug', 'description'],
      updateSpaceDto,
      spaceBefore,
      updatedSpace,
    );
    if (columnChanges) {
      Object.assign(before, columnChanges.before);
      Object.assign(after, columnChanges.after);
    }

    if (Object.keys(after).length > 0) {
      this.auditService.log({
        event: AuditEvent.SPACE_UPDATED,
        resourceType: AuditResource.SPACE,
        resourceId: updateSpaceDto.spaceId,
        spaceId: updateSpaceDto.spaceId,
        changes: { before, after },
      });
    }

    return updatedSpace;
  }

  async getSpaceInfo(spaceId: string, workspaceId: string): Promise<Space> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId, {
      includeMemberCount: true,
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return space;
  }

  async getWorkspaceSpaces(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Space>> {
    return this.spaceRepo.getSpacesInWorkspace(workspaceId, pagination);
  }

  async deleteSpace(spaceId: string, workspaceId: string): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    await this.spaceRepo.deleteSpace(spaceId, workspaceId);
    await this.attachmentQueue.add(QueueJob.DELETE_SPACE_ATTACHMENTS, space);

    this.auditService.log({
      event: AuditEvent.SPACE_DELETED,
      resourceType: AuditResource.SPACE,
      resourceId: spaceId,
      spaceId: spaceId,
      changes: {
        before: {
          name: space.name,
          slug: space.slug,
          description: space.description,
        },
      },
    });
  }

  async getPersonalSpace(
    userId: string,
    workspaceId: string,
  ): Promise<Space | null> {
    const space = await this.spaceRepo.findPersonalSpace(userId, workspaceId);
    return space ?? null;
  }

  async createPersonalSpace(
    authUser: User,
    workspace: Workspace,
    name?: string,
  ): Promise<Space> {
    const settings = (workspace.settings ?? {}) as Record<string, any>;
    if (settings?.spaces?.allowPersonal !== true) {
      throw new ForbiddenException('Personal spaces are disabled');
    }

    const existing = await this.spaceRepo.findPersonalSpace(
      authUser.id,
      workspace.id,
    );
    if (existing) {
      throw new BadRequestException('You already have a personal space');
    }

    const spaceName = name?.trim() || 'Personal space';
    const slug = await this.generateUniqueSpaceSlug(spaceName, workspace.id);

    try {
      return await this.createSpace(
        authUser,
        workspace.id,
        { name: spaceName, slug },
        undefined,
        { isPersonal: true },
      );
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      const constraint = err?.constraint ?? err?.cause?.constraint;
      if (
        code === '23505' ||
        constraint === 'spaces_personal_creator_unique'
      ) {
        throw new BadRequestException('You already have a personal space');
      }
      throw err;
    }
  }

  private async generateUniqueSpaceSlug(
    name: string,
    workspaceId: string,
  ): Promise<string> {
    let base = computeSpaceSlug(name);
    if (base.length < 2) {
      base = 'personal';
    }
    base = base.substring(0, 90);

    if (!(await this.spaceRepo.slugExists(base, workspaceId))) {
      return base;
    }

    for (let i = 0; i < 10; i++) {
      const candidate = `${base}-${generateRandomSuffixNumbers(4)}`;
      if (!(await this.spaceRepo.slugExists(candidate, workspaceId))) {
        return candidate;
      }
    }

    throw new BadRequestException(
      'Space slug exists. Please use a unique space slug',
    );
  }
}

function computeSpaceSlug(name: string): string {
  const alphanumericName = name.replace(/[^a-zA-Z0-9\s]/g, '');
  if (!alphanumericName) {
    return 'personal';
  }
  if (alphanumericName.includes(' ')) {
    return alphanumericName
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }
  return alphanumericName.toLowerCase();
}
