// @ts-nocheck
import {
  Injectable,
  Logger,
  NotImplementedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthProvider } from '@snowind/db/types/entity.types';
import {
  Issuer,
  Client,
  generators,
  TokenSet,
  UserinfoResponse,
} from 'openid-client';
import { Client as LdapClientClient } from 'ldapts';

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  async getOidcClient(authProvider: AuthProvider): Promise<Client> {
    if (authProvider.type?.toLowerCase() !== 'oidc') {
      throw new BadRequestException(
        `Auth provider is not OIDC: ${authProvider.type}`,
      );
    }

    if (!authProvider.oidcIssuer) {
      throw new BadRequestException('OIDC issuer is not configured');
    }

    if (!authProvider.oidcClientId) {
      throw new BadRequestException('OIDC client ID is not configured');
    }

    let issuer: Issuer;
    try {
      issuer = await Issuer.discover(authProvider.oidcIssuer);
    } catch (err) {
      this.logger.error(
        `Failed to discover OIDC issuer ${authProvider.oidcIssuer}`,
        err,
      );
      throw new BadRequestException(
        `Failed to discover OIDC issuer: ${authProvider.oidcIssuer}`,
      );
    }

    const client = new issuer.Client({
      client_id: authProvider.oidcClientId,
      client_secret: authProvider.oidcClientSecret ?? undefined,
      redirect_uris: authProvider.settings?.callbackUrl
        ? [authProvider.settings.callbackUrl as string]
        : undefined,
      response_types: ['code'],
      usePKCE: 'S256',
    });

    return client;
  }

  buildAuthUrl(
    client: Client,
    state: string,
    nonce: string,
    opts?: {
      redirectUri?: string;
      scope?: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    },
  ): string {
    const params: Record<string, unknown> = {
      state,
      nonce,
      scope: opts?.scope ?? 'openid email profile',
      response_type: 'code',
    };

    if (opts?.redirectUri) {
      params.redirect_uri = opts.redirectUri;
    }

    if (opts?.codeChallenge && opts?.codeChallengeMethod) {
      params.code_challenge = opts.codeChallenge;
      params.code_challenge_method = opts.codeChallengeMethod;
    }

    try {
      return client.authorizationUrl(params);
    } catch (err) {
      this.logger.error('Failed to build OIDC auth URL', err);
      throw new BadRequestException('Failed to build OIDC authorization URL');
    }
  }

  async validateCallback(
    client: Client,
    params: Record<string, unknown>,
    nonce: string,
    opts?: { redirectUri?: string; codeVerifier?: string },
  ): Promise<{ tokenSet: TokenSet; userinfo: UserinfoResponse }> {
    const callbackParams = client.callbackParams({
      query: params,
    } as any);

    const tokenSet = await client.callback(
      opts?.redirectUri,
      callbackParams,
      {
        nonce,
        code_verifier: opts?.codeVerifier,
      },
    );

    const userinfo = await client.userinfo(tokenSet);

    return { tokenSet, userinfo };
  }

  generateStateNonce(): { state: string; nonce: string } {
    return {
      state: generators.state(),
      nonce: generators.nonce(),
    };
  }

  generatePkceVerifier(): {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: string;
  } {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  async getLdapClient(
    authProvider: AuthProvider,
  ): Promise<{ client: LdapClientClient; baseDn: string }> {
    if (authProvider.type?.toLowerCase() !== 'ldap') {
      throw new BadRequestException(
        `Auth provider is not LDAP: ${authProvider.type}`,
      );
    }

    if (!authProvider.ldapUrl) {
      throw new BadRequestException('LDAP URL is not configured');
    }

    const url = authProvider.ldapUrl;
    const baseDn = authProvider.ldapBaseDn ?? '';
    const bindDn = authProvider.ldapBindDn ?? undefined;
    const bindPassword = authProvider.ldapBindPassword ?? undefined;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException(`Invalid LDAP URL: ${url}`);
    }

    const isLdaps = parsedUrl.protocol === 'ldaps:';
    const tlsEnabled =
      authProvider.ldapTlsEnabled === true || isLdaps
        ? true
        : authProvider.ldapTlsEnabled === false
          ? false
          : undefined;

    const client = new LdapClientClient({
      url,
      tlsOptions: tlsEnabled
        ? {
            ca: authProvider.ldapTlsCaCert ?? undefined,
          }
        : undefined,
    });

    try {
      if (bindDn && bindPassword) {
        await client.bind(bindDn, bindPassword);
      }
    } catch (err) {
      this.logger.error('LDAP bind failed', err);
      try {
        await client.unbind();
      } catch {
        // ignore
      }
      throw new BadRequestException('Failed to bind LDAP client');
    }

    return { client, baseDn };
  }

  async searchLdapUser(
    authProvider: AuthProvider,
    identifier: string,
    identifierAttribute = 'uid',
  ): Promise<{
    dn: string;
    attributes: Record<string, string | string[]>;
  } | null> {
    const { client, baseDn } = await this.getLdapClient(authProvider);

    try {
      const filter = authProvider.ldapUserSearchFilter
        ? authProvider.ldapUserSearchFilter.replace(
            /%s/g,
            this.escapeLdapFilter(identifier),
          )
        : `(${identifierAttribute}=${this.escapeLdapFilter(identifier)})`;

      const { searchEntries } = await client.search(baseDn, {
        filter,
        scope: 'sub',
        attributes: ['*'],
        sizeLimit: 1,
      });

      if (searchEntries.length === 0) {
        return null;
      }

      const entry = searchEntries[0];
      const attributes: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(entry)) {
        if (key === 'dn') continue;
        if (Array.isArray(value)) {
          attributes[key] = value.map((v) => String(v));
        } else {
          attributes[key] = String(value);
        }
      }

      return {
        dn: String(entry.dn),
        attributes,
      };
    } finally {
      try {
        await client.unbind();
      } catch {
        // ignore
      }
    }
  }

  async verifyLdapPassword(
    authProvider: AuthProvider,
    dn: string,
    password: string,
  ): Promise<boolean> {
    const { client } = await this.getLdapClient(authProvider);
    try {
      try {
        await client.unbind();
      } catch {
        // ignore previous bind context
      }
      await client.bind(dn, password);
      return true;
    } catch {
      return false;
    } finally {
      try {
        await client.unbind();
      } catch {
        // ignore
      }
    }
  }

  private escapeLdapFilter(input: string): string {
    return input
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }

  async getSamlConfig(_authProvider: AuthProvider): Promise<never> {
    throw new NotImplementedException('SAML SSO service not implemented');
  }
}
