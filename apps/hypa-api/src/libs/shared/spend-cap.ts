import { AsyncLocalStorage } from 'async_hooks';

export class SpendCap {
  private chargedUsd = 0;
  private reservedUsd = 0;

  constructor(
    private readonly capUsd: number,
    private readonly otherUsd: () => number,
  ) {}

  get charged(): number {
    return this.chargedUsd;
  }

  get reserved(): number {
    return this.reservedUsd;
  }

  step<T>(run: () => Promise<T>): Promise<T> {
    return steps.run({ cap: this, heldUsd: 0 }, run);
  }

  reserve(amount: number): SpendReservation {
    if (!Number.isFinite(amount) || amount < 0) throw budgetError();
    if (
      this.otherUsd() + this.chargedUsd + this.reservedUsd + amount >
      this.capUsd + EPSILON
    ) {
      throw budgetError();
    }
    this.reservedUsd += amount;
    return { amount, released: false };
  }

  release(reservation: SpendReservation) {
    if (reservation.released) return;
    reservation.released = true;
    this.reservedUsd = Math.max(0, this.reservedUsd - reservation.amount);
  }

  charge(step: Step, amount: number) {
    if (
      step.heldUsd <= EPSILON &&
      this.otherUsd() + this.chargedUsd + this.reservedUsd + amount >
        this.capUsd + EPSILON
    ) {
      throw budgetError();
    }
    step.heldUsd += amount;
    this.chargedUsd += amount;
  }

  refund(step: Step, amount: number) {
    step.heldUsd = Math.max(0, step.heldUsd - amount);
    this.chargedUsd = Math.max(0, this.chargedUsd - amount);
  }
}

export interface SpendReservation {
  readonly amount: number;
  released: boolean;
}

interface Step {
  cap: SpendCap;
  heldUsd: number;
}

const EPSILON = 1e-9;
const steps = new AsyncLocalStorage<Step>();

export function chargeSpend(amount: number) {
  const step = steps.getStore();
  if (step) step.cap.charge(step, amount);
}

export function refundSpend(amount: number) {
  const step = steps.getStore();
  if (step) step.cap.refund(step, amount);
}

function budgetError() {
  return Object.assign(new Error('This request would pass the spend cap.'), {
    code: 'budget_exceeded',
  });
}
