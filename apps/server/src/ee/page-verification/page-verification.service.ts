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
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { PagePermissionRepo } from '@snowind/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@snowind/db/repos/space/space-member.repo';
import { executeWithCursorPagination } from '@snowind/db/pagination/cursor-pagination';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import {
  Page,
  PageVerification,
  UpdatablePageVerification,
  User,
} from '@snowind/db/types/entity.types';
import { executeTx } from '@snowind/db/utils';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { getPageTitle } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  IApprovalRejectedNotificationJob,
  IApprovalRequestedNotificationJob,
  IPageVerifiedNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import { NotificationType } from '../../core/notification/notification.constants';
import { WsService } from '../../ws/ws.service';
import {
  ExpirationMode,
  ListVerificationsDto,
  MAX_VERIFIERS,
  PeriodUnit,
  RejectApprovalDto,
  SetupVerificationDto,
  UpdateVerificationDto,
  VerificationType,
} from './dto/page-verification.dto';
import {
  EXPIRING_WINDOW_MS,
  PERIOD_UNIT_DAYS,
  PERIOD_UNIT_MAX_AMOUNT,
} from './page-verification.constants';

type UserRef = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type VerifierRef = UserRef & { email: string };

type VerificationRow = PageVerification & {
  verifiedBy?: UserRef | null;
  requestedBy?: UserRef | null;
  rejectedBy?: UserRef | null;
  verifiers?: VerifierRef[];
};

@Injectable()
export class PageVerificationService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly wsService: WsService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async getVerificationInfo(pageId: string, user: User) {
    const page = await this.requirePage(pageId);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.findVerificationByPageId(page.id);
    if (!verification) {
      return { status: 'none' };
    }

    const canManage = await this.canManagePage(page, user);
    const isVerifier = (verification.verifiers ?? []).some(
      (verifier) => verifier.id === user.id,
    );

    return {
      id: verification.id,
      pageId: verification.pageId,
      type: verification.type,
      mode: verification.mode,
      periodAmount: verification.periodAmount,
      periodUnit: verification.periodUnit,
      status: this.resolveStatus(verification),
      verifiedAt: verification.verifiedAt,
      verifiedBy: verification.verifiedBy ?? null,
      expiresAt: verification.expiresAt,
      requestedAt: verification.requestedAt,
      requestedBy: verification.requestedBy ?? null,
      rejectedAt: verification.rejectedAt,
      rejectedBy: verification.rejectedBy ?? null,
      rejectionComment: verification.rejectionComment,
      verifiers: verification.verifiers ?? [],
      permissions: {
        canVerify: isVerifier,
        canManage,
        canSubmitForApproval: canManage,
        canMarkObsolete: canManage,
      },
    };
  }

  async setupVerification(dto: SetupVerificationDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.assertCanManage(page, user);

    const existing = await this.db
      .selectFrom('pageVerifications')
      .select('id')
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    if (existing) {
      throw new BadRequestException('Verification is already enabled');
    }

    const type: VerificationType = dto.type ?? 'expiring';
    const verifierIds = uniqueIds(dto.verifierIds);
    await this.assertVerifiers(page, verifierIds);

    const now = new Date();
    let mode: ExpirationMode | null = null;
    let periodAmount: number | null = null;
    let periodUnit: PeriodUnit | null = null;
    let expiresAt: Date | null = null;
    let status: string;
    let verifiedAt: Date | null = null;
    let verifiedById: string | null = null;

    if (type === 'qms') {
      status = 'draft';
    } else {
      mode = dto.mode ?? 'period';
      if (mode === 'period') {
        periodAmount = dto.periodAmount ?? 1;
        periodUnit = dto.periodUnit ?? 'month';
      }
      expiresAt = this.computeExpiresAt(
        mode,
        periodAmount,
        periodUnit,
        dto.fixedExpiresAt,
        now,
      );
      status = 'verified';
      verifiedAt = now;
      verifiedById = user.id;
    }

    await executeTx(this.db, async (trx) => {
      const created = await trx
        .insertInto('pageVerifications')
        .values({
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          type,
          status,
          mode,
          periodAmount,
          periodUnit,
          verifiedAt,
          verifiedById,
          expiresAt,
          creatorId: user.id,
        })
        .returningAll()
        .executeTakeFirst();

      if (!created) {
        throw new BadRequestException('Failed to enable verification');
      }

      await trx
        .insertInto('pageVerifiers')
        .values(
          verifierIds.map((verifierId, index) => ({
            pageVerificationId: created.id,
            userId: verifierId,
            isPrimary: index === 0,
            addedById: user.id,
          })),
        )
        .execute();
    });

    this.auditService.log({
      event: AuditEvent.PAGE_VERIFICATION_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        type,
        verifierIds,
      },
    });

    if (type === 'expiring') {
      this.auditService.log({
        event: AuditEvent.PAGE_VERIFIED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        metadata: { title: getPageTitle(page.title) },
      });
      await this.notifyVerified(page, user, verifierIds);
    }

    await this.emitUpdated(page);
  }

  async updateVerification(dto: UpdateVerificationDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.assertCanManage(page, user);

    const verification = await this.requireVerification(page.id);
    if (verification.status === 'obsolete') {
      throw new BadRequestException(
        'Cannot update verification on an obsolete page',
      );
    }

    const hasExpirationUpdate =
      dto.mode !== undefined ||
      dto.periodAmount !== undefined ||
      dto.periodUnit !== undefined ||
      dto.fixedExpiresAt !== undefined;
    const hasVerifierUpdate = dto.verifierIds !== undefined;

    if (!hasExpirationUpdate && !hasVerifierUpdate) {
      throw new BadRequestException('No verification changes provided');
    }

    if (hasExpirationUpdate && verification.type === 'qms') {
      throw new BadRequestException(
        'Approval workflow does not support expiration settings',
      );
    }

    let verifierIds: string[] | undefined;
    if (hasVerifierUpdate) {
      verifierIds = uniqueIds(dto.verifierIds);
      await this.assertVerifiers(page, verifierIds);
    }

    const now = new Date();
    const updates: UpdatablePageVerification = { updatedAt: now };

    if (hasExpirationUpdate && verification.type === 'expiring') {
      const mode = (dto.mode ?? verification.mode ?? 'period') as ExpirationMode;
      let periodAmount = verification.periodAmount;
      let periodUnit = verification.periodUnit as PeriodUnit | null;
      if (mode === 'period') {
        periodAmount = dto.periodAmount ?? periodAmount ?? 1;
        periodUnit = dto.periodUnit ?? periodUnit ?? 'month';
      } else {
        periodAmount = null;
        periodUnit = null;
      }
      const from = verification.verifiedAt
        ? new Date(verification.verifiedAt)
        : new Date();
      updates.mode = mode;
      updates.periodAmount = periodAmount;
      updates.periodUnit = periodUnit;
      updates.expiresAt = this.computeExpiresAt(
        mode,
        periodAmount,
        periodUnit,
        dto.fixedExpiresAt,
        from,
      );
    }

    await executeTx(this.db, async (trx) => {
      await trx
        .updateTable('pageVerifications')
        .set(updates)
        .where('id', '=', verification.id)
        .execute();

      if (verifierIds) {
        await trx
          .deleteFrom('pageVerifiers')
          .where('pageVerificationId', '=', verification.id)
          .execute();
        await trx
          .insertInto('pageVerifiers')
          .values(
            verifierIds.map((verifierId, index) => ({
              pageVerificationId: verification.id,
              userId: verifierId,
              isPrimary: index === 0,
              addedById: user.id,
            })),
          )
          .execute();
      }
    });

    this.auditService.log({
      event: AuditEvent.PAGE_VERIFICATION_UPDATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        verifierIds,
        mode: updates.mode,
      },
    });

    await this.emitUpdated(page);
  }

  async removeVerification(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.assertCanManage(page, user);

    const verification = await this.requireVerification(page.id);

    await this.db
      .deleteFrom('pageVerifications')
      .where('id', '=', verification.id)
      .execute();

    this.auditService.log({
      event: AuditEvent.PAGE_VERIFICATION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { title: getPageTitle(page.title) },
    });

    await this.emitUpdated(page);
  }

  async verifyPage(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.requireVerification(page.id);
    await this.assertIsVerifier(verification.id, user.id);

    const now = new Date();

    if (verification.type === 'qms') {
      if (verification.status !== 'in_approval') {
        throw new BadRequestException('Page is not awaiting approval');
      }

      await this.db
        .updateTable('pageVerifications')
        .set({
          status: 'approved',
          verifiedAt: now,
          verifiedById: user.id,
          rejectedAt: null,
          rejectedById: null,
          rejectionComment: null,
          updatedAt: now,
        })
        .where('id', '=', verification.id)
        .execute();

      this.auditService.log({
        event: AuditEvent.PAGE_VERIFIED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        metadata: { title: getPageTitle(page.title), type: 'qms' },
      });
    } else {
      if (
        verification.mode === 'fixed' &&
        verification.expiresAt &&
        new Date(verification.expiresAt).getTime() <= Date.now()
      ) {
        throw new BadRequestException('The fixed expiration date has passed');
      }

      const expiresAt =
        verification.mode === 'fixed'
          ? verification.expiresAt
          : this.computeExpiresAt(
              (verification.mode as ExpirationMode) ?? 'period',
              verification.periodAmount,
              verification.periodUnit as PeriodUnit | null,
              undefined,
              now,
            );

      await executeTx(this.db, async (trx) => {
        await trx
          .updateTable('pageVerifications')
          .set({
            status: 'verified',
            verifiedAt: now,
            verifiedById: user.id,
            expiresAt,
            updatedAt: now,
          })
          .where('id', '=', verification.id)
          .execute();

        await trx
          .deleteFrom('notifications')
          .where('pageVerificationId', '=', verification.id)
          .where('type', 'in', [
            NotificationType.PAGE_VERIFICATION_EXPIRING,
            NotificationType.PAGE_VERIFICATION_EXPIRED,
          ])
          .execute();
      });

      this.auditService.log({
        event: AuditEvent.PAGE_VERIFIED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        metadata: { title: getPageTitle(page.title) },
      });
    }

    const verifierIds = await this.getVerifierIds(verification.id);
    await this.notifyVerified(page, user, verifierIds);
    await this.emitUpdated(page);
  }

  async submitForApproval(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.assertCanManage(page, user);

    const verification = await this.requireVerification(page.id);
    if (verification.type !== 'qms') {
      throw new BadRequestException(
        'Only approval workflow pages can be submitted for approval',
      );
    }
    if (
      verification.status !== 'draft' &&
      verification.status !== 'approved'
    ) {
      throw new BadRequestException(
        'Page cannot be submitted for approval in its current state',
      );
    }

    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'in_approval',
        requestedAt: now,
        requestedById: user.id,
        rejectedAt: null,
        rejectedById: null,
        rejectionComment: null,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    const verifierIds = await this.getVerifierIds(verification.id);
    const jobData: IApprovalRequestedNotificationJob = {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: verifierIds.filter((id) => id !== user.id),
    };
    if (jobData.verifierIds.length > 0) {
      await this.notificationQueue.add(
        QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION,
        jobData,
      );
    }

    this.auditService.log({
      event: AuditEvent.PAGE_APPROVAL_REQUESTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { title: getPageTitle(page.title) },
    });

    await this.emitUpdated(page);
  }

  async rejectApproval(dto: RejectApprovalDto, user: User) {
    const page = await this.requirePage(dto.pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.requireVerification(page.id);
    await this.assertIsVerifier(verification.id, user.id);

    if (verification.type !== 'qms' || verification.status !== 'in_approval') {
      throw new BadRequestException('Page is not awaiting approval');
    }

    const comment = dto.comment?.trim() || null;
    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'draft',
        rejectedAt: now,
        rejectedById: user.id,
        rejectionComment: comment,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    if (verification.requestedById && verification.requestedById !== user.id) {
      const jobData: IApprovalRejectedNotificationJob = {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestedById: verification.requestedById,
        comment: comment ?? undefined,
      };
      await this.notificationQueue.add(
        QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION,
        jobData,
      );
    }

    this.auditService.log({
      event: AuditEvent.PAGE_APPROVAL_REJECTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        title: getPageTitle(page.title),
        comment: comment ?? undefined,
      },
    });

    await this.emitUpdated(page);
  }

  async markObsolete(pageId: string, user: User) {
    const page = await this.requirePage(pageId, true);
    await this.assertWorkspaceEnabled(page.workspaceId);
    await this.assertCanManage(page, user);

    const verification = await this.requireVerification(page.id);
    if (verification.type !== 'qms' || verification.status !== 'approved') {
      throw new BadRequestException(
        'Only approved pages can be marked obsolete',
      );
    }

    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'obsolete',
        updatedAt: new Date(),
      })
      .where('id', '=', verification.id)
      .execute();

    this.auditService.log({
      event: AuditEvent.PAGE_MARKED_OBSOLETE,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { title: getPageTitle(page.title) },
    });

    await this.emitUpdated(page);
  }

  async listVerifications(dto: ListVerificationsDto, user: User) {
    await this.assertWorkspaceEnabled(user.workspaceId);
    const limit = dto.limit ?? 20;

    let query = this.db
      .selectFrom('pageVerifications')
      .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
      .innerJoin('spaces', 'spaces.id', 'pageVerifications.spaceId')
      .select((eb) => [
        'pageVerifications.id',
        'pageVerifications.pageId',
        'pageVerifications.spaceId',
        'pageVerifications.type',
        'pageVerifications.status',
        'pageVerifications.mode',
        'pageVerifications.periodAmount',
        'pageVerifications.periodUnit',
        'pageVerifications.verifiedAt',
        'pageVerifications.expiresAt',
        'pageVerifications.createdAt',
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
        'pages.icon as pageIcon',
        'spaces.name as spaceName',
        'spaces.slug as spaceSlug',
        jsonArrayFrom(
          eb
            .selectFrom('pageVerifiers')
            .innerJoin('users', 'users.id', 'pageVerifiers.userId')
            .select([
              'users.id',
              'users.name',
              'users.avatarUrl',
            ])
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            )
            .where('users.deletedAt', 'is', null)
            .orderBy('pageVerifiers.createdAt', 'asc'),
        ).as('verifiers'),
      ])
      .where('pageVerifications.workspaceId', '=', user.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where(
        'pageVerifications.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(user.id),
      );

    if (dto.spaceIds?.length) {
      query = query.where('pageVerifications.spaceId', 'in', dto.spaceIds);
    }
    if (dto.type) {
      query = query.where('pageVerifications.type', '=', dto.type);
    }
    if (dto.verifierId) {
      query = query.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('pageVerifiers')
            .select('pageVerifiers.id')
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            )
            .where('pageVerifiers.userId', '=', dto.verifierId),
        ),
      );
    }
    if (dto.query) {
      query = query.where('pages.title', 'ilike', `%${dto.query}%`);
    }

    const result = await executeWithCursorPagination(query, {
      perPage: limit,
      cursor: dto.cursor,
      beforeCursor: dto.beforeCursor,
      fields: [
        { expression: 'pageVerifications.id', direction: 'desc', key: 'id' },
      ],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });

    const accessiblePageIds = await this.pagePermissionRepo.filterAccessiblePageIds(
      {
        pageIds: result.items.map((item) => item.pageId),
        userId: user.id,
      },
    );
    const accessible = new Set(accessiblePageIds);

    return {
      ...result,
      items: result.items
        .filter((item) => accessible.has(item.pageId))
        .map((item) => ({
          ...item,
          status: this.resolveStatus(item),
        })),
    };
  }

  computeExpiresAt(
    mode: ExpirationMode,
    periodAmount: number | null | undefined,
    periodUnit: PeriodUnit | null | undefined,
    fixedExpiresAt: string | undefined,
    from: Date,
  ): Date | null {
    if (mode === 'indefinite') {
      return null;
    }

    if (mode === 'fixed') {
      if (!fixedExpiresAt) {
        throw new BadRequestException('A fixed expiration date is required');
      }
      const expiresAt = new Date(fixedExpiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException(
          'The fixed expiration date must be in the future',
        );
      }
      return expiresAt;
    }

    if (mode !== 'period') {
      throw new BadRequestException('Invalid expiration mode');
    }
    if (
      !periodAmount ||
      !periodUnit ||
      !Number.isInteger(periodAmount) ||
      periodAmount < 1 ||
      periodAmount > PERIOD_UNIT_MAX_AMOUNT[periodUnit]
    ) {
      throw new BadRequestException('Invalid verification period');
    }

    const expiresAt = new Date(from);
    expiresAt.setDate(
      expiresAt.getDate() + periodAmount * PERIOD_UNIT_DAYS[periodUnit],
    );
    return expiresAt;
  }

  resolveStatus(verification: {
    type: string;
    status: string | null;
    expiresAt: Date | string | null;
  }): string {
    if (verification.type === 'qms') {
      return verification.status ?? 'draft';
    }
    if (!verification.expiresAt) {
      return 'verified';
    }
    const expiresAt = new Date(verification.expiresAt).getTime();
    const now = Date.now();
    if (expiresAt <= now) {
      return 'expired';
    }
    if (expiresAt - now <= EXPIRING_WINDOW_MS) {
      return 'expiring';
    }
    return 'verified';
  }

  private async findVerificationByPageId(
    pageId: string,
  ): Promise<VerificationRow | undefined> {
    return this.db
      .selectFrom('pageVerifications')
      .selectAll('pageVerifications')
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.verifiedById'),
        ).as('verifiedBy'),
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.requestedById'),
        ).as('requestedBy'),
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'pageVerifications.rejectedById'),
        ).as('rejectedBy'),
        jsonArrayFrom(
          eb
            .selectFrom('pageVerifiers')
            .innerJoin('users', 'users.id', 'pageVerifiers.userId')
            .select([
              'users.id',
              'users.name',
              'users.avatarUrl',
              'users.email',
            ])
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            )
            .where('users.deletedAt', 'is', null)
            .orderBy('pageVerifiers.createdAt', 'asc'),
        ).as('verifiers'),
      ])
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  private async requireVerification(pageId: string): Promise<PageVerification> {
    const verification = await this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }
    return verification;
  }

  private async requirePage(pageId: string, rejectDeleted = false): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || (rejectDeleted && page.deletedAt)) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async assertWorkspaceEnabled(workspaceId: string): Promise<void> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('settings')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    const enabled = (
      workspace?.settings as {
        pageVerification?: { enabled?: boolean };
      } | null
    )?.pageVerification?.enabled;
    if (enabled === false) {
      throw new ForbiddenException('Page verification is disabled');
    }
  }

  private async canManagePage(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch {
      return false;
    }
  }

  private async assertCanManage(page: Page, user: User): Promise<void> {
    await this.pageAccessService.validateCanEdit(page, user);
  }

  private async assertIsVerifier(
    verificationId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.db
      .selectFrom('pageVerifiers')
      .select('id')
      .where('pageVerificationId', '=', verificationId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!row) {
      throw new ForbiddenException();
    }
  }

  private async assertVerifiers(page: Page, verifierIds: string[]): Promise<void> {
    if (verifierIds.length === 0) {
      throw new BadRequestException('At least one verifier is required');
    }
    if (verifierIds.length > MAX_VERIFIERS) {
      throw new BadRequestException(
        `A page can have at most ${MAX_VERIFIERS} verifiers`,
      );
    }

    const users = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', 'in', verifierIds)
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .execute();
    if (users.length !== verifierIds.length) {
      throw new BadRequestException('One or more verifiers were not found');
    }

    const allowed = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      verifierIds,
      page.spaceId,
    );
    if (allowed.size !== verifierIds.length) {
      throw new BadRequestException(
        'All verifiers must be members of this space',
      );
    }

    const accessible = await this.pagePermissionRepo.getUserIdsWithPageAccess(
      page.id,
      verifierIds,
    );
    if (accessible.length !== verifierIds.length) {
      throw new BadRequestException(
        'All verifiers must have access to this page',
      );
    }
  }

  private async getVerifierIds(verificationId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verificationId)
      .execute();
    return rows.map((row) => row.userId);
  }

  private async notifyVerified(
    page: Page,
    actor: User,
    verifierIds: string[],
  ): Promise<void> {
    const recipients = verifierIds.filter((id) => id !== actor.id);
    if (recipients.length === 0) {
      return;
    }
    const jobData: IPageVerifiedNotificationJob = {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: actor.id,
      verifierIds: recipients,
    };
    await this.notificationQueue.add(
      QueueJob.PAGE_VERIFIED_NOTIFICATION,
      jobData,
    );
  }

  private async emitUpdated(page: Page): Promise<void> {
    await this.wsService.emitCommentEvent(page.spaceId, page.id, {
      operation: 'verificationUpdated',
      pageId: page.id,
    });
  }
}

function uniqueIds(ids?: string[]): string[] {
  return Array.from(new Set((ids ?? []).filter(Boolean)));
}
