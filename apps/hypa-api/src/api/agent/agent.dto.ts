import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsUUID,
} from 'class-validator';

export class AgentContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  fieldText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  selectedText?: string;
}

export class AgentAttachmentDto {
  @IsString()
  @IsNotEmpty()
  data: string;

  @IsOptional()
  @IsString()
  mime?: string;
}

export class AgentAsrDto {
  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsString()
  @IsNotEmpty()
  model: string;
}

export class AgentRequestDto {
  @IsUUID()
  requestId: string;

  @IsOptional()
  @IsString()
  input?: string;

  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsOptional()
  @IsIn(['app', 'keyboard'])
  surface?: 'app' | 'keyboard';

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  audio?: string;

  @IsOptional()
  @IsIn(['base64', 'url'])
  audioType?: 'base64' | 'url';

  @IsOptional()
  @IsBoolean()
  preferAudio?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentAsrDto)
  asr?: AgentAsrDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentContextDto)
  context?: AgentContextDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AgentAttachmentDto)
  attachments?: AgentAttachmentDto[];
}
