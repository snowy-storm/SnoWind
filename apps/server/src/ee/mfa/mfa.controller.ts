import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { MfaService } from './services/mfa.service';
import {
  MfaEnableDto,
  MfaPasswordConfirmDto,
  MfaSetupDto,
  MfaVerifyDto,
} from './dto/mfa.dto';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';

@Controller('mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('status')
  async status(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.mfaService.getStatus(user.id, workspace.id);
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setup(@Req() req: FastifyRequest, @Body() _dto: MfaSetupDto) {
    return this.mfaService.setupFromRequest(req);
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async enable(@Req() req: FastifyRequest, @Body() dto: MfaEnableDto) {
    return this.mfaService.enableFromRequest(req, dto.verificationCode);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaPasswordConfirmDto,
  ) {
    return this.mfaService.disableMfa(
      user.id,
      workspace.id,
      dto.confirmPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('generate-backup-codes')
  async generateBackupCodes(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaPasswordConfirmDto,
  ) {
    return this.mfaService.regenerateBackupCodes(
      user.id,
      workspace.id,
      dto.confirmPassword,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('validate-access')
  async validateAccess(@Req() req: FastifyRequest) {
    return this.mfaService.validateMfaAccess(req);
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verify(
    @Body() dto: MfaVerifyDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.mfaService.verifyAndLogin(dto.code, req, res);
  }
}
