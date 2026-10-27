import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, USER_QUEUE_JOBS } from '../queue.constants';
import { CompletedHistoryQueue } from './completed-history.queue';

export { USER_QUEUE_JOBS } from '../queue.constants';

const GENERATE_WOTD_CRON = '0 0 0,5,10,15,20 * * *';
export interface deductBalanceData {
  userId: string;
  amount: number;
}

export interface refundBalanceData {
  userId: string;
  amount: number;
  reason?: string;
}

export interface RecordDevRequestPayload {
  historyId?: string;
  body: { model: string; provider: string } & Record<string, unknown>;
  type: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rates: { input: number; output: number };
  userId: string;
  apiKeyId: string;
  chargeType?: string;
  audioDurationSeconds?: number;
  characterCount?: number;
  actualCost: number;
}

const GENERATE_WOTD_SCHEDULER_ID = 'user.wotd.generate.scheduler';
@Injectable()
export class UserQueue implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectQueue(QUEUE_NAMES.USER_QUEUE) private readonly queue: Queue,
    private readonly completedHistory: CompletedHistoryQueue,
  ) {}
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      GENERATE_WOTD_SCHEDULER_ID,
      { pattern: GENERATE_WOTD_CRON },
      {
        name: USER_QUEUE_JOBS.GENERATE_WOTD,
        data: {},
        opts: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60_000,
          },
        },
      },
    );
  }
  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.removeJobScheduler(GENERATE_WOTD_SCHEDULER_ID);
    } finally {
      await this.queue.close();
    }
  }

  async deductBalance(data: deductBalanceData) {
    await this.queue.add(USER_QUEUE_JOBS.BALANCE_DEDUCT, data);
  }

  async recordDevRequest(data: RecordDevRequestPayload) {
    const body = { ...data.body };
    delete body.audio;
    await this.queue.add(USER_QUEUE_JOBS.REQUEST_RECORD, { ...data, body });
  }

  async recordCompletedDevRequest(
    data: RecordDevRequestPayload & { historyId: string },
  ) {
    await this.completedHistory.record(data);
  }

  async refundBalance(data: refundBalanceData) {
    await this.queue.add(USER_QUEUE_JOBS.BALANCE_REFUND, data);
  }
}
