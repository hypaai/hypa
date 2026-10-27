import { Module } from '@nestjs/common';
import { DeveloperModule } from '../developer/developer.module';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { AutoRouterService } from './auto-router/auto-router.service';
import { TranslateMtService } from './mt/translate-mt.service';

@Module({
  imports: [DeveloperModule],
  controllers: [TranslateController],
  providers: [TranslateService, AutoRouterService, TranslateMtService],
})
export class TranslateModule {}
