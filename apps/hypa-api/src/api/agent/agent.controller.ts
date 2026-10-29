import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { User } from 'src/libs/shared/decorator/user.decorator';
import { type UserType } from 'src/db-types';
import { AgentService } from './agent.service';
import { AgentRequestDto } from './agent.dto';
import { detectAudioMime, detectImageMime } from 'src/libs/shared/audio-mime';

@UseGuards(AuthGuard)
@Controller('v2/agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  @Sse()
  async run(@Body() body: AgentRequestDto, @User() user?: UserType) {
    const job = await this.agent.open({
      requestId: body.requestId,
      userId: user?.id,
      input: body.input ?? '',
      provider: body.provider,
      model: body.model,
      surface: body.surface ?? 'app',
      chatId: body.chatId,
      language: body.language,
      audio: body.audio,
      audioType: body.audioType,
      asr: body.asr,
      preferAudio: body.preferAudio,
      context: body.context,
      attachments: body.attachments,
      history: body.history,
    });
    return this.stream(job);
  }

  @Get('media')
  async media(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() response: Response,
  ) {
    const bytes = await this.agent.readMedia(key, Number(exp), sig);
    response.setHeader(
      'Content-Type',
      detectAudioMime(bytes) ?? detectImageMime(bytes) ?? 'application/octet-stream',
    );
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(bytes);
  }

  @Get(':requestId')
  status(@Param('requestId') requestId: string, @User() user?: UserType) {
    return this.agent.status(user?.id, requestId);
  }

  private stream(job: Awaited<ReturnType<AgentService['open']>>) {
    return new Observable((subscriber) => {
      const stop = this.agent.subscribe(job, (event) => {
        if (!event) {
          subscriber.complete();
          return;
        }
        subscriber.next({ data: JSON.stringify(event) });
      });
      return () => stop();
    });
  }
}
