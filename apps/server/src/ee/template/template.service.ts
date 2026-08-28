import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TemplateRepo } from '@snowind/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@snowind/db/repos/space/space-member.repo';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { UserRole } from '../../common/helpers/types/permission';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { PageService } from '../../core/page/services/page.service';
import {
  createYdocFromJson,
  getProsemirrorContent,
} from '../../common/helpers/prosemirror/utils';
import { jsonToNode, jsonToText } from '../../collaboration/collaboration.util';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/templates.dto';

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pageService: PageService,
  ) {}

  async list(
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
    spaceId?: string,
  ) {
    const accessibleSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
      user.id,
    );
    return this.templateRepo.findTemplates(
      workspace.id,
      accessibleSpaceIds,
      pagination,
      { spaceId },
    );
  }

  async getById(user: User, workspaceId: string, templateId: string) {
    const template = await this.templateRepo.findById(templateId, workspaceId, {
      includeContent: true,
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    await this.assertCanView(user, template.spaceId);
    return template;
  }

  async create(user: User, workspace: Workspace, dto: CreateTemplateDto) {
    const spaceId = dto.spaceId ?? null;
    await this.assertCanCreate(user, workspace, spaceId);

    const content = getProsemirrorContent(undefined);
    this.validateContent(content);

    const inserted = await this.templateRepo.insertTemplate({
      title: dto.title.trim(),
      description: dto.description ?? null,
      icon: dto.icon ?? null,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      content,
      textContent: jsonToText(content),
      ydoc: createYdocFromJson(content),
    });

    if (!inserted?.id) {
      throw new BadRequestException('Failed to create template');
    }

    return this.templateRepo.findById(inserted.id, workspace.id, {
      includeContent: true,
    });
  }

  async update(user: User, workspace: Workspace, dto: UpdateTemplateDto) {
    const template = await this.templateRepo.findById(
      dto.templateId,
      workspace.id,
    );
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.assertCanManage(user, workspace, template.spaceId);

    const nextSpaceId =
      dto.spaceId === undefined ? template.spaceId : dto.spaceId;
    if (nextSpaceId !== template.spaceId) {
      await this.assertCanCreate(user, workspace, nextSpaceId);
    }

    const updates: Record<string, unknown> = {
      lastUpdatedById: user.id,
    };

    if (dto.title !== undefined) {
      updates.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      updates.description = dto.description;
    }
    if (dto.icon !== undefined) {
      updates.icon = dto.icon || null;
    }
    if (dto.spaceId !== undefined) {
      updates.spaceId = dto.spaceId;
    }
    if (dto.content !== undefined) {
      this.validateContent(dto.content);
      updates.content = dto.content;
      updates.textContent = jsonToText(dto.content);
      updates.ydoc = createYdocFromJson(dto.content);
    }

    await this.templateRepo.updateTemplate(
      updates,
      dto.templateId,
      workspace.id,
    );

    return this.templateRepo.findById(dto.templateId, workspace.id, {
      includeContent: true,
    });
  }

  async delete(user: User, workspace: Workspace, templateId: string) {
    const template = await this.templateRepo.findById(templateId, workspace.id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    await this.assertCanManage(user, workspace, template.spaceId);
    await this.templateRepo.deleteTemplate(templateId, workspace.id);
  }

  async use(user: User, workspace: Workspace, dto: UseTemplateDto) {
    const template = await this.templateRepo.findById(
      dto.templateId,
      workspace.id,
      { includeContent: true },
    );
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    await this.assertCanView(user, template.spaceId);

    if (dto.parentPageId) {
      const parentPage = await this.pageRepo.findById(dto.parentPageId);
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== dto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const content = template.content
      ? template.content
      : getProsemirrorContent(undefined);

    return this.pageService.create(user.id, workspace.id, {
      title: template.title ?? undefined,
      icon: template.icon ?? undefined,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      content,
      format: 'json',
    });
  }

  private isWorkspaceAdmin(user: User): boolean {
    return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
  }

  private membersCanCreateTemplates(workspace: Workspace): boolean {
    const settings = workspace.settings as
      | { templates?: { allowMemberTemplates?: boolean } }
      | null;
    return settings?.templates?.allowMemberTemplates === true;
  }

  private async assertCanView(user: User, spaceId: string | null) {
    if (!spaceId) {
      return;
    }
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertCanCreate(
    user: User,
    workspace: Workspace,
    spaceId: string | null,
  ) {
    if (!spaceId) {
      if (!this.isWorkspaceAdmin(user)) {
        throw new ForbiddenException(
          'Only workspace admins can create global templates.',
        );
      }
      return;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'You need edit access to this space to create templates.',
      );
    }

    if (
      !this.isWorkspaceAdmin(user) &&
      !this.membersCanCreateTemplates(workspace)
    ) {
      throw new ForbiddenException(
        'You need edit access to this space to create templates.',
      );
    }
  }

  private async assertCanManage(
    user: User,
    workspace: Workspace,
    spaceId: string | null,
  ) {
    if (this.isWorkspaceAdmin(user)) {
      return;
    }
    if (!spaceId || !this.membersCanCreateTemplates(workspace)) {
      throw new ForbiddenException();
    }
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private validateContent(content: unknown) {
    try {
      jsonToNode(content);
    } catch {
      throw new BadRequestException('Invalid content format');
    }
  }
}
