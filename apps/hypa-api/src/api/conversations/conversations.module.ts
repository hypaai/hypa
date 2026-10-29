import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { ConversationsController } from './conversations.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [AgentModule],
  controllers: [ConversationsController],
  providers: [ConversationService],
})
export class ConversationsModule {}
