export const USER_QUEUE_JOBS = {
  BALANCE_DEDUCT: 'user.balance.deduct',
  REQUEST_RECORD: 'user.request.record',
  BALANCE_REFUND: 'user.balance.refund',
  GENERATE_WOTD: 'user.wotd.generate',
} as const;

export const QUEUE_NAMES = {
  USER_QUEUE: 'user-queue',
  POD_QUEUE: 'pod-queue',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
};

export const COMPLETED_JOB_RETENTION = { age: 24 * 60 * 60, count: 10 };
export const POD_FAILED_JOB_RETENTION = { age: 7 * 24 * 60 * 60, count: 50 };

export const USER_BALANCE_CACHE_TTL_MS = 10 * 1000;
