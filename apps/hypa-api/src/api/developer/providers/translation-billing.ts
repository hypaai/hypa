import { Prisma } from 'src/generated/prisma/client';
import type { DeveloperSharedService } from './shared.service';

export type TranslationBilling = Pick<
  DeveloperSharedService,
  'deductBalance' | 'refundBalance' | 'recordDevRequest'
>;
type UsageRecord = Parameters<TranslationBilling['recordDevRequest']>[0];

export class AutoAttemptBilling implements TranslationBilling {
  private state: 'pending' | 'accepted' | 'abandoned' = 'pending';
  private reserved?: Prisma.Decimal;
  private record?: UsageRecord;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly shared: TranslationBilling,
    private readonly userId: string,
  ) {}

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }

  deductBalance(_userId: string, cost: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.state !== 'pending')
        throw new DOMException('AUTO attempt ended', 'AbortError');
      await this.shared.deductBalance(this.userId, cost);
      this.reserved = (this.reserved ?? new Prisma.Decimal(0)).plus(cost);
    });
  }

  refundBalance(
    _userId: string,
    amount: number,
    reason?: string,
  ): Promise<void> {
    return this.enqueue(async () => {
      if (!this.reserved) return;
      const refund = Prisma.Decimal.min(this.reserved, amount);
      if (refund.lte(0)) return;
      await this.shared.refundBalance(this.userId, refund.toNumber(), reason);
      this.reserved = this.reserved.minus(refund);
    });
  }

  recordDevRequest(record: UsageRecord): Promise<void> {
    if (this.state !== 'pending')
      return Promise.reject(
        new DOMException('AUTO attempt ended', 'AbortError'),
      );
    this.record = record;
    return Promise.resolve();
  }

  accept(): Promise<void> {
    if (this.state !== 'pending')
      return Promise.reject(
        new DOMException('AUTO attempt ended', 'AbortError'),
      );
    this.state = 'accepted';
    return this.enqueue(async () => {
      try {
        if (this.record) await this.shared.recordDevRequest(this.record);
      } catch (error) {
        this.state = 'abandoned';
        await this.refundRemaining();
        throw error;
      }
    });
  }

  abandon(): Promise<void> {
    if (this.state === 'accepted') return Promise.resolve();
    this.state = 'abandoned';
    return this.enqueue(() => this.refundRemaining());
  }

  private async refundRemaining(): Promise<void> {
    if (!this.reserved || this.reserved.lte(0)) return;
    await this.shared.refundBalance(
      this.userId,
      this.reserved.toNumber(),
      'AUTO attempt failed',
    );
    this.reserved = new Prisma.Decimal(0);
    this.record = undefined;
  }
}
