import { modelHost } from '@hypa/config/model-hosts';
import { MODELS } from '@hypa/config/models';
import type { FunctionTool } from '@hypa/intelligence-core';
import { GoogleVertexAiService } from 'src/ai/google.ai.service';
import { MetaAiService } from 'src/ai/meta.ai.service';
import { OpenAiAiService } from 'src/ai/openai.ai.service';
import type { LoopMessage, ModelStep } from './agent.loop';

export const AGENT_CLIENTS = Symbol('AGENT_CLIENTS');

export interface AgentModelOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  thinking?: boolean;
}

export interface AgentClients {
  openai: OpenAiAiService;
  meta: MetaAiService;
  vertex: GoogleVertexAiService;
}

function modelRow(provider: string, model: string) {
  return MODELS[provider]?.find((entry) => entry.name === model);
}

export function modelAcceptsImages(provider: string, model: string): boolean {
  return modelRow(provider, model)?.vision === true;
}

export async function completeAgentTurn(
  clients: AgentClients,
  input: {
    provider: string;
    model: string;
    messages: LoopMessage[];
    tools: FunctionTool[];
    signal?: AbortSignal;
    options?: AgentModelOptions;
    onTextDelta?: (text: string) => void;
  },
): Promise<ModelStep> {
  const row = modelRow(input.provider, input.model);
  if (!row?.baseApiUrl) {
    throw new Error(`${input.provider}/${input.model} has no chat endpoint`);
  }
  const capability = row.capabilities.includes('AC')
    ? 'AC'
    : row.capabilities[0];
  const host = modelHost(capability, input.provider, input.model);
  const served = row.servedModelName || input.model;

  if (input.provider === 'openai') {
    const result = await clients.openai.chatWithTools(
      input.messages,
      served,
      row.baseApiUrl,
      input.tools,
      input.signal,
      input.options,
      input.onTextDelta,
    );
    return result;
  }

  if (host === 'meta-api') {
    return clients.meta.chatWithTools(
      input.messages,
      served,
      row.baseApiUrl,
      input.tools,
      input.signal,
      input.options,
      input.onTextDelta,
    );
  }

  if (host === 'vertex') {
    return clients.vertex.chatWithTools(
      input.messages,
      served,
      row.baseApiUrl,
      input.tools,
      input.signal,
      input.options,
      input.onTextDelta,
    );
  }

  throw new Error(`${input.provider}/${input.model} has no tool transport`);
}
