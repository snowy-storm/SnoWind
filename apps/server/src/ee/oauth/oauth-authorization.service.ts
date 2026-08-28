// @ts-nocheck
import {
  Injectable,
  Logger,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { nanoid } from 'nanoid';
import { createHash, timingSafeEqual } from 'crypto';
import {
  InsertableOAuthClient,
  InsertableOAuthAuthorizationCode,
  InsertableOAuthGrant,
  InsertableOAuthToken,
  OAuthClient,
} from '@snowind/db/types/entity.types';

@Injectable()
export class OAuthAuthorizationService {
  private readonly logger = new Logger(OAuthAuthorizationService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async validateClient(
    clientId: string,
    clientSecret?: string,
    redirectUri?: string,
    grantType?: string,
  ): Promise<OAuthClient> {
    const client = await this.db
      .selectFrom('oauthClients')
      .selectAll()
      .where('id', '=', clientId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!client) {
      throw new UnauthorizedException('Invalid client');
    }

    if (client.secretHash && clientSecret) {
      const secretHash = this.sha256(clientSecret);
      const expected = Buffer.from(client.secretHash);
      const actual = Buffer.from(secretHash);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        throw new UnauthorizedException('Invalid client secret');
      }
    } else if (client.secretHash && !clientSecret) {
      throw new UnauthorizedException('Client secret required');
    }

    if (redirectUri) {
      const uris = Array.isArray(client.redirectUris)
        ? (client.redirectUris as string[])
        : [];
      if (!uris.includes(redirectUri)) {
        throw new UnauthorizedException('Invalid redirect URI');
      }
    }

    if (grantType) {
      const grants = Array.isArray(client.grantTypes)
        ? (client.grantTypes as string[])
        : [];
      if (!grants.includes(grantType)) {
        throw new UnauthorizedException('Grant type not allowed');
      }
    }

    return client;
  }

  async issueAccessToken(opts: {
    userId: string;
    workspaceId: string;
    clientId: string;
    scopes: string[];
    accessTokenJti?: string;
    accessTtlSec?: number;
    refreshToken?: string;
    refreshTtlSec?: number;
  }): Promise<{
    accessTokenJti: string;
    refreshTokenHash?: string;
    accessExpiresAt: Date;
    refreshExpiresAt?: Date;
  }> {
    const now = new Date();
    const accessTtlSec = opts.accessTtlSec ?? 60 * 60;
    const accessExpiresAt = new Date(now.getTime() + accessTtlSec * 1000);

    const accessTokenJti = opts.accessTokenJti ?? nanoid(32);

    let refreshTokenHash: string | undefined;
    let refreshExpiresAt: Date | undefined;
    if (opts.refreshToken) {
      refreshTokenHash = this.sha256(opts.refreshToken);
      const refreshTtlSec = opts.refreshTtlSec ?? 60 * 60 * 24 * 30;
      refreshExpiresAt = new Date(now.getTime() + refreshTtlSec * 1000);
    }

    let grant = await this.db
      .selectFrom('oauthGrants')
      .select(['id', 'revokedAt'])
      .where('userId', '=', opts.userId)
      .where('clientId', '=', opts.clientId)
      .where('workspaceId', '=', opts.workspaceId)
      .executeTakeFirst();

    if (!grant) {
      const grantInsert: InsertableOAuthGrant = {
        id: nanoid(),
        userId: opts.userId,
        clientId: opts.clientId,
        workspaceId: opts.workspaceId,
        scopes: opts.scopes,
      };
      const [inserted] = await this.db
        .insertInto('oauthGrants')
        .values(grantInsert)
        .returning(['id', 'revokedAt'])
        .execute();
      grant = inserted;
    } else if (grant.revokedAt) {
      throw new UnauthorizedException('Grant has been revoked');
    }

    const tokenInsert: InsertableOAuthToken = {
      id: nanoid(),
      grantId: grant.id,
      workspaceId: opts.workspaceId,
      accessTokenJti,
      refreshTokenHash: refreshTokenHash ?? null,
      scopes: opts.scopes,
      accessExpiresAt,
      refreshExpiresAt: refreshExpiresAt ?? null,
    };

    await this.db
      .insertInto('oauthTokens')
      .values(tokenInsert)
      .execute();

    return {
      accessTokenJti,
      refreshTokenHash,
      accessExpiresAt,
      refreshExpiresAt,
    };
  }

  async saveAuthorizationCode(opts: {
    code: string;
    clientId: string;
    userId: string;
    workspaceId: string;
    redirectUri: string;
    scopes: string[];
    expiresAt: Date;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): Promise<void> {
    const codeHash = this.sha256(opts.code);
    const insert: InsertableOAuthAuthorizationCode = {
      id: nanoid(),
      codeHash,
      clientId: opts.clientId,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      scopes: opts.scopes,
      redirectUri: opts.redirectUri,
      expiresAt: opts.expiresAt,
      codeChallenge: opts.codeChallenge ?? null,
      codeChallengeMethod: opts.codeChallengeMethod ?? null,
    };
    await this.db
      .insertInto('oauthAuthorizationCodes')
      .values(insert)
      .execute();
  }

  async consumeAuthorizationCode(opts: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<{
    userId: string;
    workspaceId: string;
    scopes: string[];
  }> {
    const codeHash = this.sha256(opts.code);
    const row = await this.db
      .selectFrom('oauthAuthorizationCodes')
      .selectAll()
      .where('codeHash', '=', codeHash)
      .where('clientId', '=', opts.clientId)
      .executeTakeFirst();

    if (!row) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    if (row.consumedAt) {
      throw new UnauthorizedException('Authorization code already used');
    }

    const now = new Date();
    if (row.expiresAt < now) {
      throw new UnauthorizedException('Authorization code expired');
    }

    if (row.redirectUri !== opts.redirectUri) {
      throw new UnauthorizedException('Redirect URI mismatch');
    }

    if (row.codeChallenge) {
      if (!opts.codeVerifier) {
        throw new UnauthorizedException('Missing PKCE code verifier');
      }
      const expected = this.computePkceCodeChallenge(
        opts.codeVerifier,
        row.codeChallengeMethod || 'S256',
      );
      if (expected !== row.codeChallenge) {
        throw new UnauthorizedException('PKCE verification failed');
      }
    }

    await this.db
      .updateTable('oauthAuthorizationCodes')
      .set({ consumedAt: now })
      .where('id', '=', row.id)
      .execute();

    const scopes = Array.isArray(row.scopes) ? (row.scopes as string[]) : [];

    return {
      userId: row.userId,
      workspaceId: row.workspaceId,
      scopes,
    };
  }

  async revokeTokenByRefreshToken(
    refreshToken: string,
    clientId: string,
    workspaceId: string,
  ): Promise<void> {
    const refreshTokenHash = this.sha256(refreshToken);
    const token = await this.db
      .selectFrom('oauthTokens')
      .select(['oauthTokens.id', 'oauthGrants.clientId as clientId'])
      .innerJoin('oauthGrants', 'oauthTokens.grantId', 'oauthGrants.id')
      .where('refreshTokenHash', '=', refreshTokenHash)
      .where('oauthTokens.workspaceId', '=', workspaceId)
      .executeTakeFirst();

    if (!token) return;
    if (token.clientId !== clientId) {
      throw new UnauthorizedException('Token does not belong to client');
    }

    const now = new Date();
    await this.db
      .updateTable('oauthTokens')
      .set({ revokedAt: now })
      .where('id', '=', token.id)
      .execute();
  }

  async createClient(
    opts: InsertableOAuthClient,
  ): Promise<OAuthClient & { clientSecret?: string }> {
    const id = opts.id ?? nanoid();
    let clientSecret: string | undefined;

    const secretHash = opts.secretHash ?? null;
    if (!secretHash && opts.tokenEndpointAuthMethod !== 'none') {
      clientSecret = nanoid(48);
    }

    const insert: InsertableOAuthClient = {
      ...opts,
      id,
      secretHash: clientSecret ? this.sha256(clientSecret) : secretHash,
    };

    const [client] = await this.db
      .insertInto('oauthClients')
      .values(insert)
      .returningAll()
      .execute();

    return { ...client, clientSecret };
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }

  private computePkceCodeChallenge(
    verifier: string,
    method: string,
  ): string {
    if (method === 'plain') {
      return verifier;
    }
    if (method === 'S256') {
      return createHash('sha256')
        .update(verifier, 'ascii')
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    }
    throw new NotImplementedException(
      `Unsupported PKCE challenge method: ${method}`,
    );
  }
}
