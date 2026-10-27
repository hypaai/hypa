import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { setTimeout as delay } from 'timers/promises';
import { QUEUE_NAMES, USER_QUEUE_JOBS } from '../queue.constants';
import type { RecordDevRequestPayload } from './user.queue';

@Injectable()
export class CompletedHistoryQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@InjectQueue(QUEUE_NAMES.USER_QUEUE) userQueue: Queue) {
    this.queue = new Queue(userQueue.name, {
      prefix: userQueue.opts.prefix,
      defaultJobOptions: userQueue.opts.defaultJobOptions,
      connection: {
        ...(userQueue.opts.connection as RedisOptions),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 1000,
        connectTimeout: 1000,
      },
      skipWaitingForReady: true,
      skipVersionCheck: true,
    });
    this.queue.on('error', () => {
      Logger.warn('Completed-history Redis producer unavailable');
    });
  }

  async record(data: RecordDevRequestPayload & { historyId: string }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.queue.add(USER_QUEUE_JOBS.REQUEST_RECORD, data, {
          jobId: `request-history-${data.historyId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });
        return;
      } catch {
        if (attempt < 2) await delay(attempt === 0 ? 250 : 1000);
      }
    }
    Logger.error({
      message: 'Completed request history submission exhausted retries',
      historyId: data.historyId,
      provider: data.body.provider,
      model: data.body.model,
      userId: data.userId,
      cost: data.actualCost,
    });
  }

  async onModuleDestroy() {
    try {
      await this.queue.close();
    } catch {
      Logger.warn(
        'Completed-history producer closed without Redis acknowledgement',
      );
    } finally {
      await this.queue.disconnect();
    }
  }
}
