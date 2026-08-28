// @ts-nocheck
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { JwtOAuthPayload } from '../../../core/auth/dto/jwt-payload';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { isUserDisabled } from '../../../common/helpers';

@Injectable()
export class OAuthStrategyService {
  private readonly logger = new Logger(OAuthStrategyService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async validateOAuthToken(
    payload: JwtOAuthPayload,
    opts: { workspaceId?: string; host?: string },
  ): Promise<{ user: User; workspace: Workspace }> {
    if (!payload || payload.type !== 'oauth_access') {
      throw new UnauthorizedException('Invalid OAuth token type');
    }

    const jti = payload.jti;
    if (!jti) {
      throw new UnauthorizedException('Missing token jti');
    }

    if (opts.workspaceId && opts.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException('Workspace does not match token');
    }

    const tokenRow = await this.db
      .selectFrom('oauthTokens')
      .select([
        'id',
        'grantId',
        'workspaceId',
        'scopes',
        'accessExpiresAt',
        'revokedAt',
      ])
      .where('accessTokenJti', '=', jti)
      .where('workspaceId', '=', payload.workspaceId)
      .executeTakeFirst();

    if (!tokenRow) {
      throw new UnauthorizedException('OAuth token not found');
    }

    if (tokenRow.revokedAt) {
      throw new UnauthorizedException('OAuth token has been revoked');
    }

    const now = new Date();
    if (tokenRow.accessExpiresAt && tokenRow.accessExpiresAt < now) {
      throw new UnauthorizedException('OAuth token has expired');
    }

    const grant = await this.db
      .selectFrom('oauthGrants')
      .select(['id', 'userId', 'clientId', 'workspaceId', 'scopes', 'revokedAt'])
      .where('id', '=', tokenRow.grantId)
      .where('workspaceId', '=', payload.workspaceId)
      .executeTakeFirst();

    if (!grant) {
      throw new UnauthorizedException('OAuth grant not found');
    }

    if (grant.revokedAt) {
      throw new UnauthorizedException('OAuth grant has been revoked');
    }

    const client = await this.db
      .selectFrom('oauthClients')
      .select(['id', 'workspaceId', 'redirectUris', 'scopes', 'deletedAt'])
      .where('id', '=', grant.clientId)
      .where('workspaceId', '=', payload.workspaceId)
      .executeTakeFirst();

    if (!client || client.deletedAt) {
      throw new UnauthorizedException('OAuth client is invalid or deleted');
    }

    const tokenScopes = this.parseScopes(tokenRow.scopes);
    const payloadScopes = this.parseScopes(payload.scope);
    const clientScopes = this.parseScopes(client.scopes);
    const grantScopes = this.parseScopes(grant.scopes);

    for (const s of payloadScopes) {
      if (!tokenScopes.has(s)) {
        throw new UnauthorizedException(`Scope ${s} not present in token`);
      }
      if (!grantScopes.has(s)) {
        throw new UnauthorizedException(`Scope ${s} not present in grant`);
      }
      if (!clientScopes.has(s)) {
        throw new UnauthorizedException(`Scope ${s} not allowed for client`);
      }
    }

    if (payload.aud && opts.host) {
      try {
        const audList = Array.isArray(payload.aud)
          ? payload.aud
          : [payload.aud];
        const hostMatches = audList.some((aud: string) => {
          try {
            const audUrl = new URL(aud.startsWith('http') ? aud : `https://${aud}`);
            return audUrl.host === opts.host;
          } catch {
            return aud === opts.host;
          }
        });
        if (!hostMatches && !audList.includes('snowind')) {
          this.logger.debug(
            `aud ${payload.aud} does not match host ${opts.host}`,
          );
        }
      } catch (err) {
        this.logger.debug('aud validation skipped', err);
      }
    }

    const workspace = await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', payload.workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new UnauthorizedException('Workspace not found');
    }

    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', grant.userId)
      .where('workspaceId', '=', payload.workspaceId)
      .executeTakeFirst();

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException('User not found or disabled');
    }

    await this.db
      .updateTable('oauthGrants')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', grant.id)
      .execute();

    return { user, workspace };
  }

  private parseScopes(scopes: unknown): Set<string> {
    if (!scopes) return new Set();
    if (typeof scopes === 'string') {
      return new Set(
        scopes
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    if (Array.isArray(scopes)) {
      return new Set(
        scopes.map((s) => String(s).trim()).filter(Boolean),
      );
    }
    return new Set();
  }
}
