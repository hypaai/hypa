import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from 'src/libs/db/db.service';
import { GetConversationsDto } from './conversations.dto';
import { UserType } from 'src/db-types';
import { Prisma } from 'src/generated/prisma/client';
import { AgentMediaService } from '../agent/agent.media';

interface getConversationsParams {
  query: GetConversationsDto;
  user: UserType;
}

interface getConversationMessagesParams {
  id: string;
  userId: string;
  query: GetConversationsDto;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly dbService: DbService,
    private readonly media: AgentMediaService,
  ) {}

  async getConversations({ query, user }: getConversationsParams) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.chatWhereInput = {
      userId: user.id,
      archive: false,
    };

    if (query.query) {
      where.title = {
        contains: query.query,
      };
    }
    const count = await this.dbService.chat.count({
      where,
    });
    const chats = await this.dbService.chat.findMany({
      where,
      skip,
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [{ kind: { sort: 'asc', nulls: 'last' } }, { created_at: 'desc' }],
      take: limit,
    });

    return {
      message: 'Conversations fetched successfully',
      data: chats,
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async getConversationMessages({
    id,
    userId,
    query,
  }: getConversationMessagesParams) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;
    const where: Prisma.messageWhereInput = {
      chat: {
        id,
        userId,
      },
    };
    if (query.query) {
      where.content = {
        contains: query.query,
      };
    }
    const count = await this.dbService.message.count({
      where,
    });
    const messages = await this.dbService.message.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: {
            children: true,
          },
        },
      },
    });
    return {
      message: 'Messages fetched successfully',
      data: messages.map((message) => this.withFreshMediaUrls(message)),
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  private withFreshMediaUrls<T extends { audio_key?: string | null; attachments?: unknown }>(
    message: T,
  ) {
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.map((item) => {
          if (!item || typeof item !== 'object' || !('key' in item)) return item;
          const key = (item as { key?: unknown }).key;
          if (typeof key !== 'string') return item;
          return { ...(item as object), url: this.media.url(key) };
        })
      : message.attachments;
    return {
      ...message,
      attachments,
      audioUrl: message.audio_key ? this.media.url(message.audio_key) : null,
    };
  }

  async archiveConversation(id: string, userId: string, archive: boolean) {
    const updated = await this.dbService.chat.updateMany({
      where: { id, userId },
      data: { archive },
    });
    if (updated.count !== 1) throw new NotFoundException();
  }
}
