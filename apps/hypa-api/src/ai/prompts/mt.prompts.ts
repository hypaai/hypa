import { ChatMessage } from '../ai.types';
import {
  getMtPrompt,
  getMtThinkingPrompt,
  getNonHypaLanguageDetectionPrompt,
  getNonHypaMtThinkingPrompt,
  renderPrompt,
  textTemplate,
} from '@hypa/config/prompts';

interface MTMessages {
  text: string;
  targetLang: string;
  model?: string;
  thinking?: boolean;
  sourceLang?: string;
}
export function getHypaAiMtMessages({
  sourceLang = 'auto',
  targetLang,
  text,
  model,
  thinking,
}: MTMessages): ChatMessage[] {
  const promptModel =
    model == 'Hypa-Llama3.1-8b-SFT-RP' ? 'Hypa-Llama3.1-8b-SFT' : model;
  const modelPrompt = getMtPrompt('hypaai', promptModel);
  if (promptModel == 'Hypa-Llama3.1-8b-SFT' && modelPrompt) {
    return [
      {
        role: 'system',
        content: `${thinking ? (modelPrompt.thinkingPrefix ?? '') : ''}${renderPrompt(
          modelPrompt.system ?? '',
          { sourceLang, targetLang },
        )}`,
      },
      {
        role: 'user',
        content: renderPrompt(textTemplate(modelPrompt.user), { text }),
      },
    ];
  }
  const defaultPrompt = getMtPrompt('hypaai') ?? {};
  return [
    {
      role: 'system',
      content: renderPrompt(defaultPrompt.system ?? '', {}),
    },
    {
      role: 'user',
      content: renderPrompt(textTemplate(defaultPrompt.user), {
        sourceLang,
        targetLang,
        text,
      }),
    },
  ];
}

function getOpenAiMtMessages({ targetLang, text }: MTMessages): ChatMessage[] {
  const prompt = getMtPrompt('openai') ?? {};
  return [
    {
      role: 'system',
      content: renderPrompt(prompt.system ?? '', {}),
    },
    {
      role: 'user',
      content: renderPrompt(textTemplate(prompt.user), {
        targetInstruction: !targetLang?.match(/auto/i)
          ? `to ${targetLang}`
          : '',
        text,
      }),
    },
  ];
}

function getGoogleStyleMtMessages({
  sourceLang,
  targetLang,
  text,
}: MTMessages): ChatMessage[] {
  const prompt = getMtPrompt('google') ?? {};
  const normalizedSourceLang = sourceLang?.trim();
  const shouldDetectSource =
    !normalizedSourceLang ||
    /^(auto|auto[- ]?detect)$/i.test(normalizedSourceLang);
  const userTemplate = prompt.user as
    | { auto?: string; explicit?: string }
    | undefined;
  const instruction = shouldDetectSource
    ? renderPrompt(userTemplate?.auto ?? '', { targetLang, text })
    : renderPrompt(userTemplate?.explicit ?? '', {
        sourceLang: normalizedSourceLang,
        targetLang,
        text,
      });

  return [
    {
      role: 'system',
      content: prompt.system ?? '',
    },
    {
      role: 'user',
      content: instruction,
    },
  ];
}

function getGoogleMtMessages({
  sourceLang,
  targetLang,
  text,
}: MTMessages): ChatMessage[] {
  return getGoogleStyleMtMessages({ sourceLang, targetLang, text });
}

export function getMtThinkingMessages(params: {
  provider?: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  targetText: string;
}): ChatMessage[] {
  const provider = params.provider?.trim() || 'hypaai';
  const values = {
    provider,
    sourceLang: params.sourceLang,
    sourceText: params.sourceText,
    targetLang: params.targetLang,
    targetText: params.targetText,
  };
  if (provider !== 'hypaai') {
    return getNonHypaMtThinkingPrompt().map((message) => ({
      role: message.role,
      content: renderPrompt(message.content, values),
    }));
  }

  const prompt = getMtThinkingPrompt();
  return [
    {
      role: 'system',
      content: renderPrompt(prompt.system ?? '', values),
    },
    {
      role: 'user',
      content: renderPrompt(textTemplate(prompt.user), values),
    },
  ];
}

export function getNonHypaLanguageDetectionMessages({
  provider,
  text,
}: {
  provider: string;
  text: string;
}): ChatMessage[] {
  const values = { provider, text };
  return getNonHypaLanguageDetectionPrompt().map((message) => ({
    role: message.role,
    content: renderPrompt(message.content, values),
  }));
}

interface MESSAGES extends MTMessages {
  provider?: 'openai' | 'hypaai' | 'google' | 'meta';
}

export function getMtMessages({ provider, ...rest }: MESSAGES): ChatMessage[] {
  if (provider === 'openai') {
    return getOpenAiMtMessages({ ...rest });
  }
  if (provider === 'google' || provider === 'meta') {
    return getGoogleMtMessages({ ...rest });
  }
  return getHypaAiMtMessages({ ...rest });
}
