import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './services/mfa.service';
import { TokenModule } from '../../core/auth/token.module';

@Module({
  imports: [TokenModule],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
