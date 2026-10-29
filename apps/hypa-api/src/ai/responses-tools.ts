import { MODEL_REQUEST_TIMEOUT_MS, textOutputTokens } from '@hypa/config/request-policy';
import OpenAI from 'openai';
import type {
  Response,
  ResponseInput,
} from 'openai/resources/responses/responses';
import type { FunctionTool } from '@hypa/intelligence-core';
import type { LoopMessage, ModelStep } from '../api/agent/agent.loop';
import type { AgentModelOptions } from '../api/agent/agent.transport';
import {
  isGpt56Model,
  isGpt6AstraModel,
} from './openai.model';

export function responsesInput(messages: LoopMessage[]): ResponseInput {
  return messages.flatMap((message): ResponseInput => {
    if (message.providerReply?.protocol === 'responses') {
      return message.providerReply.output.map((item) => {
        if (
          item.type === 'message' ||
          item.type === 'reasoning' ||
          item.type === 'function_call'
        )
          return item;
        throw new Error(`Unsupported provider output: ${item.type}`);
      });
    }
    if (message.role === 'tool') {
      return [
        {
          type: 'function_call_output',
          call_id: message.tool_call_id!,
          output: message.content,
        },
      ];
    }
    if (message.tool_calls?.length) {
      throw new Error('Missing native Responses tool context');
    }
    if (message.role === 'user' && message.images?.length) {
      return [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: message.content },
            ...message.images.map((url) => ({
              type: 'input_image' as const,
              image_url: url,
              detail: 'auto' as const,
            })),
          ],
        },
      ];
    }
    return [{ role: message.role, content: message.content }];
  });
}

export function parseResponsesTools(response: Response): ModelStep {
  if (response.status !== 'completed' && response.status !== 'incomplete') {
    throw new Error(
      response.error?.message || `Provider response ${response.status}`,
    );
  }
  if (!response.usage) throw new Error('Provider response usage unavailable');
  return {
    providerReply: { protocol: 'responses', output: response.output },
    text: response.output
      .flatMap((item) =>
        item.type === 'message'
          ? item.content.flatMap((part) =>
              part.type === 'output_text'
                ? [part.text]
                : part.type === 'refusal'
                  ? [part.refusal]
                  : [],
            )
          : [],
      )
      .join(''),
    toolCalls: response.output.flatMap((item) =>
      item.type === 'function_call'
        ? [{ id: item.call_id, name: item.name, arguments: item.arguments }]
        : [],
    ),
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.total_tokens,
    },
    ...(response.status === 'incomplete'
      ? {
          incompleteReason:
            response.incomplete_details?.reason === 'max_output_tokens'
              ? 'The model reached the output limit. Increase the output length and try again.'
              : 'The provider could not complete this reply.',
        }
      : {}),
  };
}

export async function responsesWithTools(input: {
  baseURL: string;
  apiKey?: string;
  model: string;
  messages: LoopMessage[];
  tools: FunctionTool[];
  signal?: AbortSignal;
  options?: AgentModelOptions;
  onTextDelta?: (text: string) => void;
}): Promise<ModelStep> {
  if (!input.apiKey) throw new Error('Provider API key is not configured');
  const meta = new URL(input.baseURL).hostname === 'api.meta.ai';
  const reasoning =
    meta || isGpt56Model(input.model) || isGpt6AstraModel(input.model);
  const effort =
    input.options?.thinking === false && isGpt56Model(input.model)
      ? 'none'
      : 'low';
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    maxRetries: 0,
    timeout: MODEL_REQUEST_TIMEOUT_MS,
  });
  const stream = await client.responses.create(
    {
      model: input.model,
      input: responsesInput(input.messages),
      tools: input.tools.map(({ function: tool }) => ({
        type: 'function',
        ...tool,
        strict: false,
      })),
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
      max_output_tokens: textOutputTokens(input.options?.max_tokens),
      ...(reasoning ? { reasoning: { effort } } : {}),
      ...(meta
        ? input.options?.temperature !== undefined
          ? { temperature: input.options.temperature }
          : input.options?.top_p !== undefined
            ? { top_p: input.options.top_p }
            : {}
        : reasoning
          ? {}
          : {
              ...(input.options?.temperature !== undefined
                ? { temperature: input.options.temperature }
                : {}),
              ...(input.options?.top_p !== undefined
                ? { top_p: input.options.top_p }
                : {}),
            }),
    },
    { signal: input.signal },
  );
  let response: Response | undefined;
  let partialText = '';
  try {
    // eslint-disable-next-line @typescript-eslint/await-thenable -- The SDK stream is an AsyncIterable.
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        partialText += event.delta;
        input.onTextDelta?.(event.delta);
      }
      if (
        event.type === 'response.completed' ||
        event.type === 'response.incomplete' ||
        event.type === 'response.failed'
      ) {
        response = event.response;
      } else if (event.type === 'error') {
        throw Object.assign(new Error(event.message), { code: event.code });
      }
    }
    if (!response)
      throw new Error('The provider stream ended before completing the reply.');
    return parseResponsesTools(response);
  } catch (error) {
    throw Object.assign(
      error instanceof Error ? error : new Error('Provider stream failed'),
      { partialText: input.onTextDelta ? undefined : partialText },
    );
  }
}
