import { createHash } from 'crypto';

export interface StoredRun {
  user_id: string;
  input_hash: string;
  status: string;
  result: unknown;
  error?: unknown;
  updated_at?: Date;
}

export function hashAgentInput(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function decideRun(
  existing: StoredRun | null,
  userId: string,
  inputHash: string,
):
  | { kind: 'start' }
  | { kind: 'conflict' }
  | { kind: 'replay'; status: string; result: unknown; error?: unknown } {
  if (!existing) return { kind: 'start' };
  if (existing.user_id !== userId || existing.input_hash !== inputHash) {
    return { kind: 'conflict' };
  }
  return { kind: 'replay', status: existing.status, result: existing.result, error: existing.error };
}
