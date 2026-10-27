import { Module } from '@nestjs/common';
import { YarnGptOperationService } from './providers/yarngpt-operation.service';
import { YarnGptDeveloperService } from './providers/yarngpt.provider.service';
import { HypaAiDeveloperService } from './providers/hypaai.provider.service';
import { DeveloperSharedModule } from './providers/shared.service';
import { OpenAiDeveloperService } from './providers/openai.provider.service';
import { WSGatewayModule } from './ws/ws.module';
import { WsAuthService } from './ws/ws-auth.service';
import { GoogleDeveloperService } from './providers/google.provider.service';
import { MansaDeveloperService } from './providers/mansa.provider.service';
import { ElevenLabsDeveloperService } from './providers/elevenlabs.provider.service';
import { MetaDeveloperService } from './providers/meta.provider.service';

@Module({
  imports: [DeveloperSharedModule, WSGatewayModule],
  providers: [
    HypaAiDeveloperService,
    OpenAiDeveloperService,
    GoogleDeveloperService,
    MansaDeveloperService,
    YarnGptDeveloperService,
    YarnGptOperationService,
    ElevenLabsDeveloperService,
    MetaDeveloperService,
    WsAuthService,
  ],
  exports: [
    HypaAiDeveloperService,
    OpenAiDeveloperService,
    GoogleDeveloperService,
    MansaDeveloperService,
    YarnGptDeveloperService,
    ElevenLabsDeveloperService,
    MetaDeveloperService,
    WsAuthService,
  ],
})
export class DeveloperModule {}
