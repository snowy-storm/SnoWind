import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@snowind/db/types/entity.types';
import { PageVerificationService } from './page-verification.service';
import {
  ListVerificationsDto,
  PageVerificationPageDto,
  RejectApprovalDto,
  SetupVerificationDto,
  UpdateVerificationDto,
} from './dto/page-verification.dto';

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('pages')
export class PageVerificationController {
  constructor(
    private readonly pageVerificationService: PageVerificationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('verification-info')
  async getVerificationInfo(
    @Body() dto: PageVerificationPageDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.getVerificationInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-verification')
  async setupVerification(
    @Body() dto: SetupVerificationDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.setupVerification(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-verification')
  async updateVerification(
    @Body() dto: UpdateVerificationDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.updateVerification(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-verification')
  async removeVerification(
    @Body() dto: PageVerificationPageDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.removeVerification(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verifyPage(
    @Body() dto: PageVerificationPageDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.verifyPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('submit-for-approval')
  async submitForApproval(
    @Body() dto: PageVerificationPageDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.submitForApproval(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject-approval')
  async rejectApproval(
    @Body() dto: RejectApprovalDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.rejectApproval(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mark-obsolete')
  async markObsolete(
    @Body() dto: PageVerificationPageDto,
    @AuthUser() user: User,
  ) {
    await this.pageVerificationService.markObsolete(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verifications')
  async listVerifications(
    @Body() dto: ListVerificationsDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.listVerifications(dto, user);
  }
}
