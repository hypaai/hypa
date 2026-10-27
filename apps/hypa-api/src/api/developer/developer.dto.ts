import { LEGACY_MODELS_BY_CAPABILITY as hypaModels } from '@hypa/config/legacy-models';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

export class BaseDeveloperBody {
  @IsOptional()
  @IsString()
  client_request_id?: string;

  @IsOptional()
  @IsString()
  input_text?: string;

  @IsOptional()
  @IsString()
  output_text?: string;

  @IsOptional()
  @IsString()
  source_lang?: string;

  @IsOptional()
  @IsString()
  target_lang?: string;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  top_k: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  top_p: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  temperature: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  max_tokens: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  repetition_penalty: number;

  @IsString()
  model: string;

  @IsString()
  provider: providerKey;
}

export class DeveloperMtDto extends BaseDeveloperBody {
  @ValidateIf(
    (body: DeveloperMtDto) =>
      body.provider !== 'auto' || body.model !== undefined,
  )
  @IsNotEmpty()
  declare model: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsBoolean()
  @IsOptional()
  thinking?: boolean;
}

export class DeveloperMtThinkingDto extends BaseDeveloperBody {
  @ValidateIf(
    (body: DeveloperMtThinkingDto) =>
      body.provider !== 'auto' || body.model !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  declare model: string;

  @IsString()
  @IsNotEmpty()
  source_text: string;

  @IsString()
  @IsNotEmpty()
  target_text: string;

  @IsString()
  @IsNotEmpty()
  declare source_lang: string;

  @IsString()
  @IsNotEmpty()
  declare target_lang: string;
}

export class DeveloperTtsDto extends BaseDeveloperBody {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeveloperTtsEnrollmentDto)
  enrollment_data?: {
    voice_name: string;
    voice_description?: string;

    data: {
      text: string;
      audio: string;
      audio_type: 'base64';
    }[];
  };
}

export class DeveloperSpeechToTextDto extends BaseDeveloperBody {
  @IsString()
  audio: string;

  @IsOptional()
  @IsString()
  system_instruction?: string;

  @IsOptional()
  @IsIn(['base64', 'url'])
  audio_type?: 'base64' | 'url';

  @IsOptional()
  @IsString()
  mime_type?: string;
}

class DeveloperTtsEnrollmentSampleDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  audio: string;

  @IsIn(['base64'])
  audio_type: 'base64';
}

class DeveloperTtsEnrollmentDto {
  @IsString()
  @IsNotEmpty()
  voice_name: string;

  @IsOptional()
  @IsString()
  voice_description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DeveloperTtsEnrollmentSampleDto)
  data: DeveloperTtsEnrollmentSampleDto[];
}

export type developerReqType = keyof typeof hypaModels;
export type providerKey =
  | 'auto'
  | 'hypaai'
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'microsoft'
  | 'elevenlabs'
  | 'yarnGPT'
  | 'mansa'
  | 'meta'
  | 'custom';

type Language =
  | 'English'
  | 'Yoruba'
  | 'Igbo'
  | 'Hausa'
  | 'French'
  | 'Spanish'
  | 'Portuguese'
  | 'German'
  | 'Annang'
  | 'Efik'
  | 'Ibibio'
  | 'Idoma'
  | 'Tiv'
  | 'Igala';

type LanguageKey =
  | 'english'
  | 'yoruba'
  | 'igbo'
  | 'hausa'
  | 'french'
  | 'spanish'
  | 'portuguese'
  | 'german'
  | 'annang'
  | 'efik'
  | 'ibibio'
  | 'idoma'
  | 'tiv';

export interface ModelRates {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
}

type ModelVoices = Partial<Record<LanguageKey, string[]>>;

export type ChargeType = 'tokens' | 'audio_minutes' | 'character_count';

interface DetailedModelConfig {
  name: string;
  displayName: string;
  base_apiURL: string;
  modelCardURL: string;
  default: boolean;
  reasoning?: boolean;
  fixedTemperature?: number;
  reasoningEffort?: string;
  languages?: Language[];
  languageCodes?: string[];
  rates?: ModelRates;
  voices?: ModelVoices;
  celeb_voices: string[];
  charge_type?: ChargeType;
  voiceEnrollmentFee?: number;
  api_key_env?: string;
  served_model_name?: string;
  timeout_ms?: number;
}

type ModelConfig = DetailedModelConfig;

type ProviderModels = ModelConfig[];

export interface ModelsByProvider {
  hypaai?: ProviderModels;
  google?: ProviderModels;
  openai?: ProviderModels;
  anthropic?: ProviderModels;
  microsoft?: ProviderModels;
  elevenlabs?: ProviderModels;
  yarnGPT?: ProviderModels;
  mansa?: ProviderModels;
}

export interface HypaModelsConfig {
  AC?: ModelsByProvider;
  MT?: ModelsByProvider;
  TTS?: ModelsByProvider;
  ASR?: ModelsByProvider;
  OCR?: ModelsByProvider;
  ALI?: ModelsByProvider;
  VC?: ModelsByProvider;
}
