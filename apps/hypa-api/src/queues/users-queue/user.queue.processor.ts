import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  COMPLETED_JOB_RETENTION,
  POD_FAILED_JOB_RETENTION,
  QUEUE_NAMES,
} from '../queue.constants';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DbService } from 'src/libs/db/db.service';
import {
  deductBalanceData,
  USER_QUEUE_JOBS,
  RecordDevRequestPayload,
  refundBalanceData,
} from './user.queue';
import {
  charge_type,
  developer_request_provider,
  developer_request_type,
} from 'src/generated/prisma/enums';
import { USER_BALANCE_CACHE_TTL_MS } from '../queue.constants';
import { WordOfTheDayService } from 'src/api/dictionary/word-of-the-day.service';

@Processor(QUEUE_NAMES.USER_QUEUE, {
  removeOnComplete: COMPLETED_JOB_RETENTION,
  removeOnFail: POD_FAILED_JOB_RETENTION,
})
export class UserQueueProcessor extends WorkerHost {
  constructor(
    private readonly db: DbService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly wordOfTheDay: WordOfTheDayService,
  ) {
    super();
  }

  async process(
    job: Job<deductBalanceData | RecordDevRequestPayload | refundBalanceData>,
  ) {
    Logger.debug('Processing job', job.name);
    switch (job.name) {
      case USER_QUEUE_JOBS.BALANCE_DEDUCT:
        return this.deductBalance(job.data as deductBalanceData);
      case USER_QUEUE_JOBS.REQUEST_RECORD:
        return this.recordDevRequest(job.data as RecordDevRequestPayload);
      case USER_QUEUE_JOBS.BALANCE_REFUND:
        return this.refundBalance(job.data as refundBalanceData);
      case USER_QUEUE_JOBS.GENERATE_WOTD:
        return this.wordOfTheDay.runWordOfTheDay();
      default:
        Logger.warn('No processor for job', job.name);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted() {}

  async deductBalance(data: deductBalanceData) {
    const { userId, amount } = data;
    const wallet = await this.db.wallet.upsert({
      where: { userId },
      update: {
        balance: { decrement: amount },
      },
      create: {
        userId,
        balance: -amount,
      },
    });
    const cacheKey = `user_balance:${userId}`;
    const newBalance = Number(wallet.balance);
    await this.cacheManager.set(
      cacheKey,
      newBalance,
      USER_BALANCE_CACHE_TTL_MS,
    );
  }

  async recordDevRequest(data: RecordDevRequestPayload) {
    const {
      body,
      type,
      usage,
      userId,
      apiKeyId,
      chargeType = 'tokens',
      audioDurationSeconds,
      characterCount,
      actualCost,
    } = data;
    if (!usage || !userId || !apiKeyId) {
      Logger.warn(
        'Record dev request skipped: missing rates, usage, userId or apiKeyId',
      );
      return;
    }
    const record = {
      model: body.model,
      provider: body.provider as developer_request_provider,
      type: type as developer_request_type,
      charge_type: chargeType as charge_type,
      data: JSON.parse(JSON.stringify(body)),
      output_tokens: usage.completion_tokens,
      prompt_tokens: usage.prompt_tokens,
      total_tokens: usage.total_tokens,
      estimated_cost: actualCost,
      audio_duration_seconds: audioDurationSeconds ?? undefined,
      character_count: characterCount ?? undefined,
      user: { connect: { id: userId } },
      api_key: { connect: { id: apiKeyId } },
    };
    if (data.historyId) {
      await this.db.developer_request.upsert({
        where: { id: data.historyId },
        create: { ...record, id: data.historyId },
        update: {},
      });
    } else {
      await this.db.developer_request.create({ data: record });
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RecordDevRequestPayload> | undefined, error: Error) {
    if (job?.name !== USER_QUEUE_JOBS.REQUEST_RECORD || !job.data.historyId) {
      Logger.error(
        `Job failed: ${job?.name ?? 'unknown'} (${job?.id ?? 'no-id'})`,
        error.stack,
        UserQueueProcessor.name,
      );
      return;
    }
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    Logger.error({
      message: 'Completed request history worker exhausted retries',
      historyId: job.data.historyId,
      provider: job.data.body.provider,
      model: job.data.body.model,
      userId: job.data.userId,
      cost: job.data.actualCost,
      errorName: error.name,
    });
  }

  async refundBalance(data: refundBalanceData) {
    const { userId, amount, reason } = data;
    Logger.log(
      `Refunding ${amount} to user ${userId}. Reason: ${reason || 'API call failed'}`,
    );

    const wallet = await this.db.wallet.upsert({
      where: { userId },
      update: {
        balance: { increment: amount },
      },
      create: {
        userId,
        balance: amount,
      },
    });

    const cacheKey = `user_balance:${userId}`;
    const newBalance = Number(wallet.balance);
    await this.cacheManager.set(
      cacheKey,
      newBalance,
      USER_BALANCE_CACHE_TTL_MS,
    );
  }
}
