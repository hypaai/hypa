import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DictionarySearchDto {
  @IsString()
  @IsNotEmpty()
  word: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsBoolean()
  @IsOptional()
  fun_facts?: boolean;

  @IsBoolean()
  @IsOptional()
  cultural_context?: boolean;

  @IsBoolean()
  @IsOptional()
  only_cc_and_ff?: boolean;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  model_name?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  output_length?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperature?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  top_p?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  top_k?: number;
}

export class GetDictionaryHistoryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  query?: string;
}

class TTSPresetDto {
  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperature?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  top_p?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  repetition_penalty?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  max_new_tokens?: number;
}

export class DictionaryTTSRequestDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsOptional()
  voice?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TTSPresetDto)
  preset?: TTSPresetDto;
}

export class DictionaryTranslateDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsOptional()
  source_lang?: string;

  @IsString()
  @IsNotEmpty()
  target_lang!: string;
}
