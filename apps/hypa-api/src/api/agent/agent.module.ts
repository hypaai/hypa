import { Module } from '@nestjs/common';
import { OpenAiAiService } from 'src/ai/openai.ai.service';
import { MetaAiService } from 'src/ai/meta.ai.service';
import { GoogleVertexAiService } from 'src/ai/google.ai.service';
import { AGENT_CLIENTS } from './agent.transport';
import { StorageService } from 'src/libs/shared/storage.service';
import { AudioModule } from '../audio/audio.module';
import { DeveloperModule } from '../developer/developer.module';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { TranslateModule } from '../translate/translate.module';
import { AgentController } from './agent.controller';
import { AgentMediaService, FirebaseBlobStore } from './agent.media';
import { AgentService } from './agent.service';
import { HypaToolExecutor } from './tool-executor';
import { LensSocketService } from './lens-socket.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({
  imports: [DeveloperModule, DictionaryModule, AudioModule, TranslateModule],
  controllers: [AgentController],
  providers: [
    {
      provide: AGENT_CLIENTS,
      useFactory: (
        openai: OpenAiAiService,
        meta: MetaAiService,
        vertex: GoogleVertexAiService,
      ) => ({ openai, meta, vertex }),
      inject: [OpenAiAiService, MetaAiService, GoogleVertexAiService],
    },
    AgentService,
    HypaToolExecutor,
    AuthGuard,
    LensSocketService,
    {
      provide: AgentMediaService,
      useFactory: (storage: StorageService) =>
        new AgentMediaService(new FirebaseBlobStore(storage)),
      inject: [StorageService],
    },
  ],
  exports: [AgentService, AgentMediaService, HypaToolExecutor],
})
export class AgentModule {}
