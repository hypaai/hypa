import { Injectable } from '@nestjs/common';
import { Observable, lastValueFrom } from 'rxjs';
import { HypaAiDeveloperService } from 'src/api/developer/providers/hypaai.provider.service';
import { DeveloperMtDto } from 'src/api/developer/developer.dto';
import { GoogleDeveloperService } from 'src/api/developer/providers/google.provider.service';
import { MansaDeveloperService } from 'src/api/developer/providers/mansa.provider.service';
import { MetaDeveloperService } from 'src/api/developer/providers/meta.provider.service';
import { OpenAiDeveloperService } from 'src/api/developer/providers/openai.provider.service';
import { DeveloperSharedService } from 'src/api/developer/providers/shared.service';
import { ProviderConfigurationError } from './translation-output';
import type { TranslationBilling } from '../../developer/providers/translation-billing';

export interface MtTranslateInput {
  provider: string;
  model: string;
  text: string;
  sourceLang: string | null;
  targetLang: string;
  preset: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    thinking?: boolean;
  };
  userId: string;
  apiKeyId?: string;
  billing?: TranslationBilling;
  signal: AbortSignal;
  validateOutput?: (text: string) => void;
}

type ProviderResponse = { data: string | Record<string, unknown> };

const parseProviderResponse = (response: ProviderResponse) => {
  const data = response?.data;
  return typeof data === 'string' ? JSON.parse(data) : data;
};

@Injectable()
export class TranslateMtService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly hypaAiDev: HypaAiDeveloperService,
    private readonly openAiDev: OpenAiDeveloperService,
    private readonly googleDev: GoogleDeveloperService,
    private readonly mansaDev: MansaDeveloperService,
    private readonly metaDev: MetaDeveloperService,
  ) {}

  async translate(input: MtTranslateInput): Promise<string> {
    try {
      if (
        input.validateOutput &&
        input.provider === 'mansa' &&
        (process.env.MANSA_MT_ENABLED !== 'true' ||
          !process.env.MANSA_API_KEY?.trim())
      ) {
        throw new ProviderConfigurationError();
      }
      return await this.execute(input);
    } catch (error) {
      if (
        input.validateOutput &&
        error instanceof Error &&
        /^(?:(?:GOOGLE_CLOUD_PROJECT|GEMINI_API_KEY|MANSA_API_KEY) is not configured|RUNPOD_API_KEY is not set but is required by this model|Translation failed: no endpoint configured for this model|Unable to create the Lab API key)$/.test(
          error.message,
        )
      ) {
        throw new ProviderConfigurationError();
      }
      throw error;
    }
  }

  private async execute(input: MtTranslateInput): Promise<string> {
    const {
      provider,
      model,
      text,
      sourceLang,
      targetLang,
      preset,
      userId,
      signal,
    } = input;
    const maxTokens = preset.max_tokens ?? 1024;
    const source = sourceLang || undefined;

    if (provider === 'auto') {
      throw new Error(
        `Provider ${provider} must be resolved before MT execution`,
      );
    }

    const apiKeyId =
      input.apiKeyId ?? (await this.shared.findOrCreateUserApiKey(userId))?.id;
    if (!apiKeyId) throw new Error('Unable to create the user API key');

    const commonBody = {
      provider,
      model,
      text,
      source_lang: source,
      target_lang: targetLang,
      max_tokens: maxTokens,
      repetition_penalty: 1,
      thinking: provider === 'mansa' ? false : (preset.thinking ?? false),
      stream: false,
    };

    if (provider === 'hypaai') {
      const response$ = await this.hypaAiDev.translateText({
        body: {
          ...commonBody,
          top_p: preset.top_p ?? 0.95,
          top_k: preset.top_k ?? 0,
          temperature: preset.temperature ?? 0.7,
        } as DeveloperMtDto,
        type: 'MT',
        userId,
        apiKeyId,
        signal,
        validateOutput: input.validateOutput,
        ...(input.billing && { billing: input.billing }),
      });
      const response = await lastValueFrom(
        response$ as Observable<ProviderResponse>,
      );
      return (
        parseProviderResponse(response)?.choices?.[0]?.message?.content || ''
      );
    }

    if (provider === 'openai') {
      const response$ = await this.openAiDev.translateText({
        body: {
          ...commonBody,
          top_p: preset.top_p ?? 0.95,
          top_k: preset.top_k ?? 0,
          temperature: preset.temperature ?? 0.7,
        } as DeveloperMtDto,
        type: 'MT',
        userId,
        apiKeyId,
        signal,
        validateOutput: input.validateOutput,
        ...(input.billing && { billing: input.billing }),
      });
      const response = await lastValueFrom(
        response$ as Observable<ProviderResponse>,
      );
      return (
        parseProviderResponse(response)?.choices?.[0]?.message?.content || ''
      );
    }

    if (provider === 'google') {
      const response$ = await this.googleDev.translateText({
        body: {
          ...commonBody,
          provider: 'google',
          top_p: preset.top_p ?? 0.95,
          top_k: preset.top_k ?? 64,
          temperature: preset.temperature ?? 1,
        } as DeveloperMtDto,
        type: 'MT',
        userId,
        apiKeyId,
        signal,
        validateOutput: input.validateOutput,
        ...(input.billing && { billing: input.billing }),
      });
      const response = await lastValueFrom(
        response$ as Observable<ProviderResponse>,
      );
      return (
        parseProviderResponse(response)?.choices?.[0]?.message?.content || ''
      ).trim();
    }

    if (provider === 'meta') {
      const response$ = await this.metaDev.translateText({
        body: {
          ...commonBody,
          top_p: preset.top_p ?? 0.95,
          temperature: preset.temperature ?? 1,
          provider: 'meta',
        } as DeveloperMtDto,
        type: 'MT',
        userId,
        apiKeyId,
        signal,
        validateOutput: input.validateOutput,
      });
      const response = await lastValueFrom(
        response$ as Observable<ProviderResponse>,
      );
      return (
        parseProviderResponse(response)?.choices?.[0]?.message?.content || ''
      ).trim();
    }

    if (provider === 'mansa') {
      const response$ = await this.mansaDev.translateText({
        body: commonBody as DeveloperMtDto,
        type: 'MT',
        userId,
        apiKeyId,
        signal,
        validateOutput: input.validateOutput,
        ...(input.billing && { billing: input.billing }),
      });
      const response = await lastValueFrom(
        response$ as Observable<ProviderResponse>,
      );
      return (
        parseProviderResponse(response)?.choices?.[0]?.message?.content || ''
      );
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }
}
