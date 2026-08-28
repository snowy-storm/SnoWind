import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { CreatePersonalSpaceDto } from './dto/create-personal-space.dto';

@UseGuards(JwtAuthGuard)
@Controller('personal-space')
export class PersonalSpaceController {
  constructor(private readonly spaceService: SpaceService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @OAuthScope('read')
  getPersonalSpace(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.spaceService.getPersonalSpace(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  createPersonalSpace(
    @Body() dto: CreatePersonalSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.spaceService.createPersonalSpace(user, workspace, dto.name);
  }
}
