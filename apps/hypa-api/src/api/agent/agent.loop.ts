import { z } from 'zod';
import {
  AGENT_MAX_TOOL_ROUNDS,
  AGENT_SPEND_CAP_USD,
  AGENT_WALL_CLOCK_MS,
} from '@hypa/config/agent';
import type { FunctionTool } from '@hypa/intelligence-core';

export const finishSchema = z.object({
  action: z.enum(['replace', 'insert', 'show']),
  text: z.string(),
  speak: z.boolean(),
  summary: z.string().optional(),
  suggestions: z.array(z.string()).max(4).optional(),
});

export type FinishAction = z.infer<typeof finishSchema>;

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type ProviderReply =
  | { protocol: 'responses'; output: import('openai/resources/responses/responses').ResponseOutputItem[] }
  | { protocol: 'vertex'; content: { role?: 'user' | 'model'; parts?: Array<Record<string, unknown>> } };

export interface ModelStep {
  providerReply?: ProviderReply;
  incompleteReason?: string;
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
}

export type AgentEvent =
  | { type: 'message_ids'; userMessageId: string; assistantMessageId: string; sentAt?: string }
  | { type: 'transcript'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      ok: boolean;
      result?: unknown;
      summary?: string;
      error?: string;
      durationMs?: number;
      provider?: string;
      model?: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'audio'; id?: string; key?: string; toolCallId?: string; url: string; mime?: string; durationMs?: number }
  | {
      type: 'done';
      action: FinishAction['action'];
      text: string;
      speak: boolean;
      summary?: string;
      suggestions?: string[];
      usage: Usage;
      cost?: number;
      audioUrl?: string;
      audioMime?: string;
      completedAt?: string;
    }
  | { type: 'error'; code: string; message: string };

export interface LoopMessage {
  providerReply?: ProviderReply;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

async function* finishAudio(
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  action: FinishAction,
  language = 'English',
): AsyncGenerator<AgentEvent> {
  if (!action.speak) return;
  try {
    const spoken = await runTool('text_to_speech', {
      text: action.text,
      language,
    });
    if (spoken && typeof spoken === 'object' && 'audio' in spoken) {
      const { mime, durationMs } = spoken as { mime?: string; durationMs?: number };
      yield { type: 'audio', url: '', ...(mime ? { mime } : {}), durationMs };
    }
  } catch (error) {
    yield {
      type: 'tool_result',
      id: 'finish-speak',
      name: 'text_to_speech',
      ok: false,
      error: error instanceof Error ? error.message : 'Could not create the audio',
    };
  }
}

const emptyUsage = (): Usage => ({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
});

const addUsage = (left: Usage, right: Usage): Usage => ({
  prompt_tokens: left.prompt_tokens + right.prompt_tokens,
  completion_tokens: left.completion_tokens + right.completion_tokens,
  total_tokens: left.total_tokens + right.total_tokens,
});

function ranWith(body: unknown): { provider?: string; model?: string } {
  if (!body || typeof body !== 'object') return {};
  const { provider, model } = body as { provider?: unknown; model?: unknown };
  return {
    ...(typeof provider === 'string' ? { provider } : {}),
    ...(typeof model === 'string' ? { model } : {}),
  };
}

export function parseFinish(raw: string): FinishAction | null {
  try {
    return finishSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError');
}

export function fallbackFinish(text: string, instruction = ''): FinishAction {
  const readAloud = /^(read( this| it)? out|speak this|say this)\.?$/i.test(instruction.trim());
  return { action: 'show', text, speak: readAloud };
}

export async function* runAgentLoop(input: {
  messages: LoopMessage[];
  tools: FunctionTool[];
  surface: 'app' | 'keyboard';
  instruction?: string;
  speechLanguage?: string;
  signal?: AbortSignal;
  complete: (messages: LoopMessage[], tools: FunctionTool[], onTextDelta: (text: string) => void) => Promise<ModelStep>;
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  costOf: (usage: Usage) => number;
  affordable?: (estimate: number) => Promise<boolean>;
  extraSpend?: () => number;
  now?: () => number;
  limits?: {
    maxToolRounds: number;
    wallClockMs: number;
    spendCapUsd: number;
    maxCompletionTokens?: number;
  };
}): AsyncGenerator<AgentEvent> {
  const limits = input.limits ?? {
    maxToolRounds: AGENT_MAX_TOOL_ROUNDS,
    wallClockMs: AGENT_WALL_CLOCK_MS,
    spendCapUsd: AGENT_SPEND_CAP_USD,
  };
  const now = input.now ?? Date.now;
  const started = now();
  const messages = input.messages.map((message) => ({ ...message }));
  let spent = 0;
  let usage = emptyUsage();
  let rounds = 0;
  let finish: FinishAction | null = null;

  const extraSpend = input.extraSpend ?? (() => 0);
  const overBudget = (next: number) => spent + extraSpend() + next > limits.spendCapUsd;
  const outOfTime = () => now() - started > limits.wallClockMs;

  const abortEvent = (): Extract<AgentEvent, { type: 'error' }> => {
    const reason = input.signal?.reason as { code?: string; message?: string } | undefined;
    return { type: 'error', code: reason?.code ?? 'budget_exceeded', message: reason?.message ?? 'The request ran out of time.' };
  };

  while (rounds <= limits.maxToolRounds) {
    if (input.signal?.aborted || outOfTime()) {
      yield abortEvent();
      return;
    }
    const estimatedTokens = JSON.stringify(messages.map((message) => ({ ...message, providerReply: undefined }))).length / 4;
    const completionTokens = limits.maxCompletionTokens ?? 400;
    const estimate = input.costOf({
      prompt_tokens: estimatedTokens,
      completion_tokens: completionTokens,
      total_tokens: estimatedTokens + completionTokens,
    });
    if (overBudget(estimate)) {
      yield { type: 'error', code: 'budget_exceeded', message: 'This request would pass the spend cap.' };
      return;
    }
    if (input.affordable && !(await input.affordable(estimate))) {
      yield {
        type: 'error',
        code: 'insufficient_balance',
        message: 'Your balance is too low for the next step.',
      };
      return;
    }
    let step: ModelStep;
    let streamedText = '';
    const deltas: string[] = [];
    let wake: (() => void) | undefined;
    let completionSettled = false;
    const completion = Promise.resolve().then(() => input.complete(messages, input.tools, (text) => {
      if (!text) return;
      streamedText += text;
      deltas.push(text);
      wake?.();
    }));
    void completion.then(() => { completionSettled = true; wake?.(); }, () => { completionSettled = true; wake?.(); });
    try {
      while (!completionSettled || deltas.length) {
        if (deltas.length) yield { type: 'delta', text: deltas.shift()! };
        else await new Promise<void>((resolve) => { wake = resolve; });
      }
      step = await completion;
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        const partialText = (error as { partialText?: unknown } | null)?.partialText;
        if (typeof partialText === 'string' && partialText) yield { type: 'delta', text: partialText };
        yield abortEvent();
        return;
      }
      throw error;
    }
    usage = addUsage(usage, step.usage);
    spent += input.costOf(step.usage);
    const remainingText = step.text.startsWith(streamedText) ? step.text.slice(streamedText.length) : step.text;
    if (remainingText) yield { type: 'delta', text: remainingText };
    if (step.incompleteReason) {
      yield { type: 'error', code: 'incomplete_response', message: step.incompleteReason };
      return;
    }
    if (step.toolCalls.length === 0) {
      const text = step.text;
      if (input.surface === 'keyboard') {
        finish = fallbackFinish(text, input.instruction);
      }
      const action = finish ?? { action: 'show' as const, text, speak: false };
      yield* finishAudio(input.runTool, action, input.speechLanguage);
      yield { type: 'done', action: action.action, text: action.text || text, speak: action.speak, usage };
      return;
    }
    if (rounds === limits.maxToolRounds) {
      yield { type: 'error', code: 'budget_exceeded', message: 'The request used its tool rounds.' };
      return;
    }
    messages.push({
      role: 'assistant',
      providerReply: step.providerReply,
      content: step.text,
      tool_calls: step.toolCalls,
    });
    const calls = step.toolCalls.map((call) => {
      let args: Record<string, unknown> = {};
      let argumentError: string | undefined;
      try {
        const parsed: unknown = JSON.parse(call.arguments);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Tool arguments must be a JSON object');
        }
        args = parsed as Record<string, unknown>;
      } catch {
        argumentError = 'Tool arguments must be a complete JSON object';
      }
      return { call, args, argumentError };
    });
    for (const { call, args } of calls) {
      yield { type: 'tool_call', id: call.id, name: call.name, args };
    }
    const runCall = async ({ call, args, argumentError }: (typeof calls)[number]) => {
      if (argumentError) {
        return { call, body: { ok: false, error: argumentError }, ok: false, error: argumentError };
      }
      if (call.name === 'finish') {
        const parsed = parseFinish(call.arguments || '{}');
        finish = parsed ?? fallbackFinish(step.text, input.instruction);
        return {
          call,
          body: finish,
          ok: parsed !== null,
          error: parsed ? undefined : 'Invalid finish arguments',
        };
      }
      try {
        const body = await input.runTool(call.name, args);
        return { call, body, ok: true as const, error: undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool failed';
        return {
          call,
          body: { ok: false, error: message },
          ok: false as const,
          error: message,
        };
      }
    };
    const pending = new Map(calls.map((call, index) => {
      const started = now();
      return [index, runCall(call).then((result) => ({
        index, result, durationMs: Math.max(0, now() - started),
      }))] as const;
    }));
    const settled: Awaited<ReturnType<typeof runCall>>[] = new Array(calls.length);
    while (pending.size > 0) {
      const { index, result, durationMs } = await Promise.race(pending.values());
      pending.delete(index);
      settled[index] = result;
      const summary = JSON.stringify(result.body).slice(0, 500);
      yield {
        type: 'tool_result',
        id: result.call.id,
        name: result.call.name,
        ok: result.ok,
        result: result.body,
        durationMs,
        ...(result.ok ? { summary } : { error: result.error }),
        ...ranWith(result.body),
      };
    }
    for (const result of settled) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(result.body),
        tool_call_id: result.call.id,
        name: result.call.name,
      });
    }
    if (settled.some((result) => result.call.name === 'finish')) {
      const action = finish ?? fallbackFinish(step.text, input.instruction);
      yield { type: 'delta', text: action.text };
      yield* finishAudio(input.runTool, action, input.speechLanguage);
      yield {
        type: 'done',
        action: action.action,
        text: action.text,
        speak: action.speak,
        ...(action.summary ? { summary: action.summary } : {}),
        ...(action.suggestions?.length ? { suggestions: action.suggestions } : {}),
        usage,
      };
      return;
    }
    rounds += 1;
  }
}
