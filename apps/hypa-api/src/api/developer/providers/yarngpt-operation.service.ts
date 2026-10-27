import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import errorCodes from '@hypa/config/json/error-codes';
import { randomUUID } from 'crypto';
import { YarnGptAiService } from 'src/ai/yarngpt.ai.service';
import { DbService } from 'src/libs/db/db.service';
import { Prisma, type yarn_tts_operation } from 'src/generated/prisma/client';
import { DeveloperSharedService } from './shared.service';

type Audio = Awaited<ReturnType<YarnGptAiService['speech']>>;
type RecoveryOperation = Omit<yarn_tts_operation, 'result'>;
const YARN_RESULT_RETENTION_MS = 24 * 60 * 60 * 1000;
interface YarnOperationInput {
  userId: string;
  apiKeyId: string;
  model: string;
  text: string;
  voice: string;
  language: string;
  apiUrl: string;
  characterCount: number;
  rate: number;
  cost: number;
  timeoutMs: number;
}
const LEASE_MS = 30_000;

@Injectable()
export class YarnGptOperationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private recovery?: Promise<void>;
  private closing = false;
  private recovering = 0;
  private readonly active = new Map<AbortController, Promise<Audio>>();

  constructor(
    private readonly db: DbService,
    private readonly yarn: YarnGptAiService,
    private readonly shared: DeveloperSharedService,
  ) {}

  onApplicationBootstrap() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 15_000);
    this.timer.unref();
  }

  private tick() {
    if (this.closing || this.recovery) return;
    this.recovery = this.recoverPending()
      .catch(() => Logger.error('YarnGPT recovery scan failed; will retry'))
      .finally(() => {
        this.recovery = undefined;
      });
  }

  async onModuleDestroy() {
    this.closing = true;
    clearInterval(this.timer);
    for (const controller of this.active.keys()) controller.abort();
    await Promise.allSettled([
      ...this.active.values(),
      ...(this.recovery ? [this.recovery] : []),
    ]);
  }

  async reserve(input: YarnOperationInput, id: string = randomUUID()) {
    const token = randomUUID();
    const operation = await this.db.$transaction(async (tx) => {
      const existing = await tx.yarn_tts_operation.findUnique({
        where: { id },
        omit: { result: true },
      });
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.apiKeyId !== input.apiKeyId
        )
          throw new ConflictException('Operation ownership mismatch');
        if (
          existing.text !== input.text ||
          existing.voice !== input.voice ||
          existing.model !== input.model ||
          existing.language !== input.language ||
          existing.apiUrl !== input.apiUrl ||
          existing.characterCount !== input.characterCount ||
          !existing.cost.equals(input.cost) ||
          !existing.rate.equals(input.rate)
        )
          throw new ConflictException('Operation request mismatch');
        return { operation: existing, token: null };
      }
      const apiKey = await tx.api_key.findFirst({
        where: { id: input.apiKeyId, userId: input.userId, is_deleted: false },
        select: { created_source: true },
      });
      if (!apiKey) throw new BadRequestException('Invalid billing identity');
      const cost = new Prisma.Decimal(input.cost);
      if (!cost.isFinite() || cost.lt(0))
        throw new BadRequestException('Invalid cost');
      const debit = await tx.wallet.updateMany({
        where: { userId: input.userId, balance: { gte: cost } },
        data: { balance: { decrement: cost } },
      });
      if (debit.count !== 1)
        throw new BadRequestException({
          message: errorCodes.INSUFFICIENT_BALANCE.message,
          code: errorCodes.INSUFFICIENT_BALANCE.code,
        });
      const now = Date.now();
      const created = await tx.yarn_tts_operation.create({
        data: {
          id,
          userId: input.userId,
          apiKeyId: input.apiKeyId,
          requestSource: apiKey.created_source,
          model: input.model,
          text: input.text,
          voice: input.voice,
          language: input.language,
          apiUrl: input.apiUrl,
          characterCount: input.characterCount,
          rate: input.rate,
          cost,
          deadlineAt: new Date(now + input.timeoutMs),
          leaseToken: token,
          leaseUntil: new Date(now + LEASE_MS),
        },
      });
      return { operation: created, token };
    });
    await this.invalidate(input.userId);
    return operation;
  }

  async execute(input: YarnOperationInput, signal?: AbortSignal) {
    if (this.closing)
      throw new ServiceUnavailableException('YarnGPT is shutting down');
    signal?.throwIfAborted();
    const { operation, token } = await this.reserve(input);
    if (!token) throw new ConflictException('Operation already exists');
    if (this.closing) {
      await this.refund(operation.id, token);
      throw new ServiceUnavailableException('YarnGPT is shutting down');
    }
    return this.run(operation, token, signal);
  }

  private run(
    operation: RecoveryOperation,
    token: string,
    signal?: AbortSignal,
  ) {
    const controller = new AbortController();
    const task = this.runClaimed(operation, token, controller, signal);
    this.active.set(controller, task);
    void task
      .finally(() => this.active.delete(controller))
      .catch(() => undefined);
    return task;
  }

  private async runClaimed(
    operation: RecoveryOperation,
    token: string,
    controller: AbortController,
    signal?: AbortSignal,
  ): Promise<Audio> {
    const owner = {
      id: operation.id,
      status: 'pending' as const,
      leaseToken: token,
    };
    let leaseLost = false;
    let renewal: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewal) return;
      renewal = this.db.yarn_tts_operation
        .updateMany({
          where: owner,
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        })
        .then(({ count }) => {
          if (!count) {
            leaseLost = true;
            controller.abort();
          }
        })
        .catch(() => {
          leaseLost = true;
          controller.abort();
        })
        .finally(() => {
          renewal = undefined;
        });
    }, 10_000);
    heartbeat.unref();
    try {
      if (operation.deadlineAt.getTime() <= Date.now()) {
        throw new DOMException('YarnGPT operation expired', 'TimeoutError');
      }
      const audio = await this.yarn.speech({
        text: operation.text,
        voice: operation.voice,
        apiUrl: operation.apiUrl,
        timeoutMs: Math.max(1, operation.deadlineAt.getTime() - Date.now()),
        deadlineAt: operation.deadlineAt.getTime(),
        idempotencyKey: operation.id,
        jobId: operation.providerJobId ?? undefined,
        onJobCreated: async (jobId) => {
          const updated = await this.db.yarn_tts_operation.updateMany({
            where: owner,
            data: { providerJobId: jobId },
          });
          if (!updated.count) {
            leaseLost = true;
            throw new ConflictException('Operation lease lost');
          }
        },
        signal: AbortSignal.any([
          controller.signal,
          ...(signal ? [signal] : []),
        ]),
      });
      signal?.throwIfAborted();
      controller.signal.throwIfAborted();
      await this.complete(operation, token, audio);
      return audio;
    } catch (error) {
      const interrupted =
        !leaseLost &&
        (this.closing || controller.signal.aborted || !!signal?.aborted);
      if (interrupted) {
        try {
          await this.releaseLease(operation.id, token);
        } catch {
          Logger.error({
            message: 'YarnGPT lease release requires recovery',
            operationId: operation.id,
            userId: operation.userId,
            costUsd: operation.cost.toString(),
          });
        }
      } else if (!leaseLost) {
        try {
          await this.refund(operation.id, token);
        } catch {
          Logger.error({
            message: 'YarnGPT refund requires recovery',
            operationId: operation.id,
            userId: operation.userId,
            costUsd: operation.cost.toString(),
          });
        }
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }

  async complete(operation: RecoveryOperation, token: string, audio: Audio) {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.yarn_tts_operation.updateMany({
        where: { id: operation.id, status: 'pending', leaseToken: token },
        data: {
          status: 'completed',
          result: audio,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (!updated.count)
        throw new ConflictException('Operation no longer owned');
    });
    try {
      await this.recordHistory(operation);
    } catch {
      Logger.warn({
        message: 'YarnGPT history requires recovery',
        operationId: operation.id,
      });
    }
  }

  async recordHistory(operation: RecoveryOperation) {
    await this.db.$transaction(async (tx) => {
      await tx.developer_request.upsert({
        where: { id: operation.id },
        update: {},
        create: {
          id: operation.id,
          userId: operation.userId,
          apiKeyId: operation.apiKeyId,
          provider: 'yarnGPT',
          model: operation.model,
          type: 'text_to_speech',
          charge_type: 'character_count',
          character_count: operation.characterCount,
          estimated_cost: operation.cost,
          request_source: operation.requestSource,
          data: {
            provider: 'yarnGPT',
            model: operation.model,
            text: operation.text,
            voice: operation.voice,
            language: operation.language,
            operationId: operation.id,
          },
        },
      });
      await tx.yarn_tts_operation.update({
        where: { id: operation.id },
        data: { historyRecorded: true },
      });
    });
  }

  private async releaseLease(id: string, token: string) {
    await this.db.yarn_tts_operation.updateMany({
      where: { id, status: 'pending', leaseToken: token },
      data: { leaseToken: null, leaseUntil: null },
    });
  }

  async refund(id: string, token: string) {
    await this.db.yarn_tts_operation.updateMany({
      where: { id, status: 'pending', leaseToken: token },
      data: { status: 'refund_pending' },
    });
    const userId = await this.db.$transaction(async (tx) => {
      const operation = await tx.yarn_tts_operation.findUniqueOrThrow({
        where: { id },
        select: { userId: true, cost: true },
      });
      const updated = await tx.yarn_tts_operation.updateMany({
        where: { id, status: 'refund_pending', leaseToken: token },
        data: { status: 'refunded', leaseToken: null, leaseUntil: null },
      });
      if (updated.count) {
        await tx.wallet.update({
          where: { userId: operation.userId },
          data: { balance: { increment: operation.cost } },
        });
      }
      return operation.userId;
    });
    await this.invalidate(userId);
  }

  private async invalidate(userId: string) {
    try {
      await this.shared.invalidateUserBalanceCache(userId);
    } catch {
      Logger.warn({
        message: 'YarnGPT balance cache invalidation failed',
        userId,
      });
    }
  }

  async recoverPending() {
    await this.db.yarn_tts_operation.updateMany({
      where: {
        status: 'completed',
        deadlineAt: { lt: new Date(Date.now() - YARN_RESULT_RETENTION_MS) },
        result: { not: Prisma.DbNull },
      },
      data: { result: Prisma.DbNull },
    });
    const histories = await this.db.yarn_tts_operation.findMany({
      where: { status: 'completed', historyRecorded: false },
      take: 10,
      orderBy: { created_at: 'asc' },
      omit: { result: true },
    });
    for (const operation of histories) {
      try {
        await this.recordHistory(operation);
      } catch {
        Logger.warn({
          message: 'YarnGPT history recovery failed',
          operationId: operation.id,
        });
      }
    }
    const now = new Date();
    const available: Prisma.yarn_tts_operationWhereInput = {
      status: { in: ['pending', 'refund_pending'] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    };
    const refunds = await this.db.yarn_tts_operation.findMany({
      where: {
        AND: [
          available,
          { OR: [{ status: 'refund_pending' }, { deadlineAt: { lte: now } }] },
        ],
      },
      orderBy: { created_at: 'asc' },
      take: 10,
      omit: { result: true },
    });
    const capacity = Math.max(0, 3 - this.recovering);
    const pending = capacity
      ? await this.db.yarn_tts_operation.findMany({
          where: {
            AND: [available, { status: 'pending', deadlineAt: { gt: now } }],
          },
          orderBy: { created_at: 'asc' },
          take: capacity,
          omit: { result: true },
        })
      : [];
    await Promise.allSettled(
      [...refunds, ...pending].map(async (operation) => {
        if (this.closing) return;
        const token = randomUUID();
        try {
          const claimed = await this.db.yarn_tts_operation.updateMany({
            where: { id: operation.id, ...available },
            data: {
              leaseToken: token,
              leaseUntil: new Date(Date.now() + LEASE_MS),
            },
          });
          if (!claimed.count) return;
          if (this.closing) {
            await this.db.yarn_tts_operation.updateMany({
              where: { id: operation.id, leaseToken: token },
              data: { leaseToken: null, leaseUntil: null },
            });
            return;
          }
          if (
            operation.status === 'refund_pending' ||
            operation.deadlineAt.getTime() <= Date.now()
          )
            await this.refund(operation.id, token);
          else {
            this.recovering++;
            void this.run(operation, token)
              .catch(() =>
                Logger.warn({
                  message: 'YarnGPT recovery did not return audio',
                  operationId: operation.id,
                }),
              )
              .finally(() => {
                this.recovering--;
              });
          }
        } catch {
          Logger.warn({
            message: 'YarnGPT recovery did not return audio',
            operationId: operation.id,
          });
        }
      }),
    );
  }
}
