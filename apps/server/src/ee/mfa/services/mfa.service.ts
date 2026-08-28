import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { UserMfaRepo } from '@snowind/db/repos/user-mfa/user-mfa.repo';
import { UserRepo } from '@snowind/db/repos/user/user.repo';
import { WorkspaceRepo } from '@snowind/db/repos/workspace/workspace.repo';
import { TokenService } from '../../../core/auth/services/token.service';
import { SessionService } from '../../../core/session/session.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  comparePasswordHash,
  hashPassword,
  isUserDisabled,
} from '../../../common/helpers';
import { throwIfEmailNotVerified } from '../../../core/auth/auth.util';
import { LoginDto } from '../../../core/auth/dto/login.dto';
import { JwtMfaTokenPayload, JwtType } from '../../../core/auth/dto/jwt-payload';
import { User, UserMFA, Workspace } from '@snowind/db/types/entity.types';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

const MFA_COOKIE = 'mfa_token';
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;

@Injectable()
export class MfaService {
  constructor(
    private userMfaRepo: UserMfaRepo,
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private tokenService: TokenService,
    private sessionService: SessionService,
    private environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getStatus(userId: string, workspaceId: string) {
    const mfa = await this.userMfaRepo.findByUserId(userId, workspaceId);
    return {
      isEnabled: mfa?.isEnabled === true,
      method: mfa?.isEnabled ? mfa.method : null,
      backupCodesCount: mfa?.isEnabled ? (mfa.backupCodes?.length ?? 0) : 0,
    };
  }

  async setupFromRequest(req: FastifyRequest) {
    const { user, workspace } = await this.resolveActor(req);
    return this.setup(user, workspace);
  }

  async setup(user: User, workspace: Workspace) {
    const existing = await this.userMfaRepo.findByUserId(
      user.id,
      workspace.id,
    );
    if (existing?.isEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: workspace.name || 'SnoWind',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpAuthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    await this.userMfaRepo.upsertUserMfa({
      userId: user.id,
      workspaceId: workspace.id,
      method: 'totp',
      secret: secret.base32,
      isEnabled: false,
      backupCodes: null,
    });

    return {
      method: 'totp',
      qrCode,
      manualKey: secret.base32,
    };
  }

  async enableFromRequest(req: FastifyRequest, verificationCode: string) {
    const { user, workspace } = await this.resolveActor(req);
    return this.enable(user.id, workspace.id, verificationCode);
  }

  async enable(userId: string, workspaceId: string, verificationCode: string) {
    const existingMfa = await this.userMfaRepo.findByUserId(
      userId,
      workspaceId,
    );

    if (!existingMfa || !existingMfa.secret) {
      throw new BadRequestException(
        'MFA secret not found. Please generate a new TOTP secret first.',
      );
    }

    if (existingMfa.isEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    if (!this.verifyTotp(existingMfa.secret, verificationCode)) {
      throw new BadRequestException('Invalid TOTP code');
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code)),
    );

    await this.userMfaRepo.updateUserMfa(existingMfa.id, {
      isEnabled: true,
      backupCodes: hashedBackupCodes,
    });

    this.auditService.log({
      event: AuditEvent.USER_MFA_ENABLED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return {
      success: true,
      backupCodes,
    };
  }

  async disableMfa(
    userId: string,
    workspaceId: string,
    password?: string,
  ) {
    await this.assertPasswordIfRequired(userId, workspaceId, password);
    await this.userMfaRepo.deleteByUserId(userId, workspaceId);

    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return { success: true };
  }

  async regenerateBackupCodes(
    userId: string,
    workspaceId: string,
    password?: string,
  ) {
    await this.assertPasswordIfRequired(userId, workspaceId, password);

    const userMfa = await this.userMfaRepo.findByUserId(userId, workspaceId);
    if (!userMfa?.isEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code)),
    );

    await this.userMfaRepo.updateUserMfa(userMfa.id, {
      backupCodes: hashedBackupCodes,
    });

    this.auditService.log({
      event: AuditEvent.USER_MFA_BACKUP_CODE_GENERATED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return { backupCodes };
  }

  async checkMfaRequirements(
    loginInput: LoginDto,
    workspace: Workspace,
    res: FastifyReply,
  ) {
    const user = await this.userRepo.findByEmail(
      loginInput.email,
      workspace.id,
      { includePassword: true, includeUserMfa: true },
    );

    const errorMessage = 'Email or password does not match';
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException(errorMessage);
    }

    const isPasswordMatch = await comparePasswordHash(
      loginInput.password,
      user.password,
    );

    if (!isPasswordMatch) {
      throw new UnauthorizedException(errorMessage);
    }

    throwIfEmailNotVerified({
      isCloud: this.environmentService.isCloud(),
      emailVerifiedAt: user.emailVerifiedAt,
      email: user.email,
      workspaceId: workspace.id,
      appSecret: this.environmentService.getAppSecret(),
    });

    const userHasMfa = user?.['mfa']?.isEnabled || false;
    const isMfaEnforced = workspace.enforceMfa || false;

    if (userHasMfa) {
      const mfaToken = await this.tokenService.generateMfaToken(
        user,
        workspace.id,
      );
      this.setMfaCookie(res, mfaToken);
      return {
        userHasMfa: true,
        requiresMfaSetup: false,
        isMfaEnforced,
        authToken: null,
      };
    }

    if (isMfaEnforced && !userHasMfa) {
      const mfaToken = await this.tokenService.generateMfaToken(
        user,
        workspace.id,
      );
      this.setMfaCookie(res, mfaToken);
      return {
        userHasMfa: false,
        requiresMfaSetup: true,
        isMfaEnforced: true,
        authToken: null,
      };
    }

    await this.userRepo.updateLastLogin(user.id, workspace.id);
    const authToken = await this.sessionService.createSessionAndToken(user);

    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'password' },
    });

    return {
      userHasMfa: false,
      requiresMfaSetup: false,
      isMfaEnforced: false,
      authToken,
    };
  }

  async validateMfaAccess(req: FastifyRequest) {
    const token = req.cookies?.[MFA_COOKIE];
    if (!token) {
      return { valid: false };
    }

    try {
      const payload = (await this.tokenService.verifyJwt(
        token,
        JwtType.MFA_TOKEN,
      )) as JwtMfaTokenPayload;

      const user = await this.userRepo.findById(
        payload.sub,
        payload.workspaceId,
      );
      if (!user || isUserDisabled(user)) {
        return { valid: false };
      }

      const mfa = await this.userMfaRepo.findByUserId(
        user.id,
        payload.workspaceId,
      );
      const workspace = await this.workspaceRepo.findById(payload.workspaceId);
      const userHasMfa = mfa?.isEnabled === true;
      const isMfaEnforced = workspace?.enforceMfa === true;

      return {
        valid: true,
        isTransferToken: true,
        userHasMfa,
        requiresMfaSetup: isMfaEnforced && !userHasMfa,
        isMfaEnforced,
      };
    } catch {
      return { valid: false };
    }
  }

  async verifyAndLogin(code: string, req: FastifyRequest, res: FastifyReply) {
    const token = req.cookies?.[MFA_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    const payload = (await this.tokenService.verifyJwt(
      token,
      JwtType.MFA_TOKEN,
    )) as JwtMfaTokenPayload;

    const user = await this.userRepo.findById(
      payload.sub,
      payload.workspaceId,
    );
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    const userMfa = await this.userMfaRepo.findByUserId(
      user.id,
      payload.workspaceId,
    );

    if (!userMfa || !userMfa.isEnabled || !userMfa.secret) {
      throw new UnauthorizedException('MFA is not enabled for this user');
    }

    const isValid = await this.verifyCode(userMfa, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code or backup code');
    }

    await this.userRepo.updateLastLogin(user.id, payload.workspaceId);
    const authToken = await this.sessionService.createSessionAndToken(user);

    res.clearCookie(MFA_COOKIE, { path: '/' });
    this.setAuthCookie(res, authToken);

    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'mfa' },
    });

    return { success: true };
  }

  private async resolveActor(
    req: FastifyRequest,
  ): Promise<{ user: User; workspace: Workspace }> {
    const authToken = req.cookies?.authToken;
    if (authToken) {
      try {
        const payload = await this.tokenService.verifyJwt(
          authToken,
          JwtType.ACCESS,
        );
        const user = await this.userRepo.findById(
          payload.sub,
          payload.workspaceId,
        );
        const workspace = await this.workspaceRepo.findById(
          payload.workspaceId,
        );
        if (
          user &&
          workspace &&
          !isUserDisabled(user) &&
          this.workspaceMatchesRequest(req, workspace.id)
        ) {
          return { user, workspace };
        }
      } catch {
        // Fall through to the MFA setup token.
      }
    }

    const mfaToken = req.cookies?.[MFA_COOKIE];
    if (mfaToken) {
      try {
        const payload = (await this.tokenService.verifyJwt(
          mfaToken,
          JwtType.MFA_TOKEN,
        )) as JwtMfaTokenPayload;
        const user = await this.userRepo.findById(
          payload.sub,
          payload.workspaceId,
        );
        const workspace = await this.workspaceRepo.findById(
          payload.workspaceId,
        );
        if (
          user &&
          workspace &&
          !isUserDisabled(user) &&
          this.workspaceMatchesRequest(req, workspace.id)
        ) {
          return { user, workspace };
        }
      } catch {
        // Handled below.
      }
    }

    throw new UnauthorizedException();
  }

  private async assertPasswordIfRequired(
    userId: string,
    workspaceId: string,
    password?: string,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId, {
      includePassword: true,
    });

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException('User not found');
    }

    const requiresPassword = !user.hasGeneratedPassword && !!user.password;
    if (!requiresPassword) {
      return;
    }

    if (!password) {
      throw new BadRequestException('Password is required');
    }

    const isPasswordMatch = await comparePasswordHash(password, user.password);
    if (!isPasswordMatch) {
      throw new BadRequestException('Password is incorrect');
    }
  }

  private async verifyCode(mfa: UserMFA, code: string): Promise<boolean> {
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      return this.verifyTotp(mfa.secret, code);
    }

    if (mfa.backupCodes?.length) {
      for (let i = 0; i < mfa.backupCodes.length; i++) {
        const match = await comparePasswordHash(code, mfa.backupCodes[i]);
        if (match) {
          const remaining = [...mfa.backupCodes];
          remaining.splice(i, 1);
          await this.userMfaRepo.updateUserMfa(mfa.id, {
            backupCodes: remaining,
          });
          return true;
        }
      }
    }

    return false;
  }

  private verifyTotp(secret: string | null, code: string): boolean {
    if (!secret) {
      return false;
    }

    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  private workspaceMatchesRequest(
    req: FastifyRequest,
    workspaceId: string,
  ): boolean {
    const requestWorkspaceId = (req.raw as { workspaceId?: string })
      ?.workspaceId;
    return !requestWorkspaceId || requestWorkspaceId === workspaceId;
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(4).toString('hex').toUpperCase(),
    );
  }

  private setMfaCookie(res: FastifyReply, token: string) {
    res.setCookie(MFA_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(Date.now() + MFA_TOKEN_TTL_MS),
      secure: this.environmentService.isHttps(),
    });
  }

  private setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
