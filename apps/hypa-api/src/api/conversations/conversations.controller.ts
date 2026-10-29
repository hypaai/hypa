import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { ArchiveConversationDto, ConversationDto, GetConversationsDto } from './conversations.dto';
import { ConversationService } from './conversation.service';
import { AuthGuard } from '../auth/auth.guard';
import { User } from 'src/libs/shared/decorator/user.decorator';
import { type UserType } from 'src/db-types';
import { AgentService } from '../agent/agent.service';

@UseGuards(AuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly agent: AgentService,
  ) {}

  @Post()
  @Sse()
  async sendConversation(
    @Body() body: ConversationDto,
    @User() user?: UserType,
  ) {
    const job = await this.agent.open({
      requestId: body.requestId || randomUUID(),
      userId: user?.id,
      input: body.input,
      provider: body.provider || 'openai',
      model: body.model || 'gpt-4o-mini',
      surface: 'app',
      chatId: body.chatId,
    });
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

  @Get()
  async getConversations(
    @Query() query: GetConversationsDto,
    @User() user: UserType,
  ) {
    return this.conversationService.getConversations({
      query,
      user,
    });
  }

  @Delete(':id')
  async deleteConversation(@Param('id') id: string, @User() user: UserType) {
    await this.agent.deleteChat(user.id, id);
    return { message: 'Chat deleted' };
  }

  @Patch(':id')
  async archiveConversation(@Param('id') id: string, @Body() body: ArchiveConversationDto, @User() user: UserType) {
    await this.conversationService.archiveConversation(id, user.id, body.archive);
    return { message: 'Chat updated' };
  }

  @Get(':id/messages')
  async getConversationMessages(
    @Param('id') id: string,
    @Query() query: GetConversationsDto,
    @User() user: UserType,
  ) {
    return this.conversationService.getConversationMessages({
      id,
      userId: user.id,
      query,
    });
  }
}
