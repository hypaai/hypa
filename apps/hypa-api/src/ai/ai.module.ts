import { YarnGptAiService } from './yarngpt.ai.service';
import { Global, Module } from '@nestjs/common';
import { HypaAiAiService } from './hypaai.ai.service';
import { OpenAiAiService } from './openai.ai.service';
import { GoogleAiService, GoogleVertexAiService } from './google.ai.service';
import { MansaAiService } from './mansa.ai.service';
import { ElevenLabsAiService } from './elevenlabs.ai.service';
import { MetaAiService } from './meta.ai.service';

@Global()
@Module({
  providers: [
    HypaAiAiService,
    OpenAiAiService,
    GoogleAiService,
    MansaAiService,
    YarnGptAiService,
    ElevenLabsAiService,
    GoogleVertexAiService,
    MetaAiService,
  ],
  exports: [
    HypaAiAiService,
    OpenAiAiService,
    GoogleAiService,
    MansaAiService,
    YarnGptAiService,
    ElevenLabsAiService,
    GoogleVertexAiService,
    MetaAiService,
  ],
})
export class AiModule {}
