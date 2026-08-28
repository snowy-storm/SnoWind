import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { ApiKeyRepo } from '@snowind/db/repos/api-key/api-key.repo';
import { WorkspaceRepo } from '@snowind/db/repos/workspace/workspace.repo';
import { JwtApiKeyPayload } from '../../core/auth/dto/jwt-payload';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { UserRole } from '../../common/helpers/types/permission';
import { TokenService } from '../../core/auth/services/token.service';
import type { StringValue } from 'ms';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(
    private apiKeyRepo: ApiKeyRepo,
    private workspaceRepo: WorkspaceRepo,
    private tokenService: TokenService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async validateApiKey(payload: JwtApiKeyPayload) {
    const { apiKeyId, sub: userId, workspaceId } = payload;

    const result = await this.db
      .selectFrom('apiKeys')
      .innerJoin('users', 'users.id', 'apiKeys.creatorId')
      .select([
        'apiKeys.id as apiKeyId',
        'apiKeys.expiresAt as apiKeyExpiresAt',
        'apiKeys.lastUsedAt as apiKeyLastUsedAt',
        'apiKeys.workspaceId as apiKeyWorkspaceId',
        'users.id',
        'users.email',
        'users.name',
        'users.avatarUrl',
        'users.role',
        'users.workspaceId',
        'users.emailVerifiedAt',
        'users.deactivatedAt',
        'users.deletedAt',
      ])
      .where('apiKeys.id', '=', apiKeyId)
      .where('apiKeys.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!result) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (result.apiKeyWorkspaceId !== workspaceId) {
      throw new UnauthorizedException('API key does not match workspace');
    }

    if (result.workspaceId !== workspaceId) {
      throw new UnauthorizedException('User does not belong to workspace');
    }

    if (result.apiKeyExpiresAt && result.apiKeyExpiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    if (result.deactivatedAt || result.deletedAt) {
      throw new UnauthorizedException('User is disabled');
    }

    await this.apiKeyRepo.updateApiKey(apiKeyId, {
      lastUsedAt: new Date(),
    });

    const user: User = {
      id: result.id,
      email: result.email,
      name: result.name,
      avatarUrl: result.avatarUrl,
      role: result.role,
      workspaceId: result.workspaceId,
      emailVerifiedAt: result.emailVerifiedAt,
      deactivatedAt: result.deactivatedAt,
      deletedAt: result.deletedAt,
    } as User;

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new UnauthorizedException('Workspace not found');
    }

    return {
      user,
      workspace,
    };
  }

  async listApiKeys(
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
  ) {
    const adminView = pagination.adminView === true;
    if (adminView && !this.isAdmin(user)) {
      throw new ForbiddenException();
    }

    return this.apiKeyRepo.getApiKeysPaginated({
      workspaceId: workspace.id,
      creatorId: adminView ? undefined : user.id,
      pagination,
    });
  }

  async createApiKey(
    user: User,
    workspace: Workspace,
    dto: CreateApiKeyDto,
  ) {
    this.assertCanCreate(user, workspace);

    const expiresAt = this.parseExpiresAt(dto.expiresAt);

    const apiKey = await this.apiKeyRepo.insertApiKey({
      name: dto.name,
      creatorId: user.id,
      workspaceId: workspace.id,
      expiresAt: expiresAt || null,
      lastUsedAt: null,
    });

    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKey.id,
      user,
      workspaceId: workspace.id,
      expiresIn: this.toJwtExpiresIn(expiresAt),
    });

    return {
      ...apiKey,
      token,
    };
  }

  async updateApiKey(user: User, workspace: Workspace, dto: UpdateApiKeyDto) {
    const apiKey = await this.apiKeyRepo.findById(dto.apiKeyId);

    if (!apiKey || apiKey.deletedAt) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.workspaceId !== workspace.id) {
      throw new BadRequestException('API key does not belong to this workspace');
    }

    if (apiKey.creatorId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException('You do not own this API key');
    }

    return this.apiKeyRepo.updateApiKey(dto.apiKeyId, {
      name: dto.name,
    });
  }

  async deleteApiKey(id: string, userId: string, workspaceId: string) {
    const apiKey = await this.apiKeyRepo.findById(id);

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.creatorId !== userId) {
      throw new BadRequestException('You do not own this API key');
    }

    if (apiKey.workspaceId !== workspaceId) {
      throw new BadRequestException('API key does not belong to this workspace');
    }

    await this.apiKeyRepo.deleteById(id, workspaceId);
  }

  async revokeApiKey(user: User, workspace: Workspace, apiKeyId: string) {
    const apiKey = await this.apiKeyRepo.findById(apiKeyId);

    if (!apiKey || apiKey.deletedAt) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.workspaceId !== workspace.id) {
      throw new BadRequestException('API key does not belong to this workspace');
    }

    if (apiKey.creatorId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException('You do not own this API key');
    }

    await this.apiKeyRepo.deleteById(apiKeyId, workspace.id);
  }

  private assertCanCreate(user: User, workspace: Workspace) {
    const settings = (workspace.settings ?? {}) as {
      api?: { restrictToAdmins?: boolean };
    };
    if (settings.api?.restrictToAdmins === true && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'API key creation is restricted to admins',
      );
    }
  }

  private isAdmin(user: User): boolean {
    return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
  }

  private parseExpiresAt(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const expiresAt = new Date(value);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Invalid expiration date');
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    return expiresAt;
  }

  private toJwtExpiresIn(expiresAt?: Date): StringValue | number {
    if (!expiresAt) {
      // Override the session JWT default so keys with no expiry stay valid.
      return '100y';
    }

    return Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }
}
