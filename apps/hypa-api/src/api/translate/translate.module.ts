import { Module } from '@nestjs/common';
import { DeveloperModule } from '../developer/developer.module';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { AutoRouterService } from './auto-router/auto-router.service';
import { TranslateMtService } from './mt/translate-mt.service';
import { LensSocketService } from './lens/lens-socket.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({
  imports: [DeveloperModule],
  controllers: [TranslateController],
  providers: [TranslateService, AutoRouterService, TranslateMtService, TranslateController, LensSocketService, AuthGuard],
  exports: [TranslateController],
})
export class TranslateModule {}
