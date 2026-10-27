import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

export const POD_QUEUE_JOBS = {
  CLEANUP_IDLE: 'pod.cleanup.idle',
} as const;

const CLEANUP_CRON = '0 */1 * * * *';

const CLEANUP_SCHEDULER_ID = 'pod.cleanup.idle.scheduler';

@Injectable()
export class PodQueue implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectQueue(QUEUE_NAMES.POD_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CLEANUP_SCHEDULER_ID,
      { pattern: CLEANUP_CRON },
      { name: POD_QUEUE_JOBS.CLEANUP_IDLE, data: {} },
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.removeJobScheduler(CLEANUP_SCHEDULER_ID);
    } finally {
      await this.queue.close();
    }
  }
}
