import { Type } from 'class-transformer';
import {
  IsInt,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';

export class ConversationDto {
  messages: {
    role: 'user' | 'assistant';
    content: string;
  }[];
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  input: string;
  @IsString()
  @IsOptional()
  chatId?: string;
  @IsString()
  @IsOptional()
  messageId?: string;
  @IsString()
  @IsOptional()
  action?: 'user:edit' | 'system:retry';
  @IsString()
  @IsOptional()
  model?: string;
  @IsString()
  @IsOptional()
  provider?: string;
  @IsUUID()
  @IsOptional()
  requestId?: string;
}

export class ConversationChunkDto {
  sequence_number: number;
  output_index: number;
  item_id: string;
  type: 'response.completed';
  delta?: string;
  item?: {
    id: string;
    type: 'mcp';
    status: string;
    name: string;
  };
  part?: {
    type: 'output_text';
    annotations: unknown[];
    text: string;
  };
  response: {
    id: string;
    status: string;
    output: {
      id: string;
      role: 'assistant';
      content: string[];
      type: 'mcp_call' | 'message';
      status: string;
      approval_request_id: null;
      arguments: '{"text":"The current price of Solana is approximately one hundred fifty-five dollars and seventeen cents."}';
      error: null;
      name: 'translate_and_generate_audio';
      output: '{"audio": string, "type": "url", "voice": "Gbemisola"}';
      server_label: 'hypa';
    }[];
    text: {
      format: unknown[];
      verbosity: string;
    };
    model: string;
  };
}

export class GetConversationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number;

  @IsOptional()
  @IsString()
  query?: string;
}

export class ArchiveConversationDto {
  @IsBoolean()
  archive: boolean;
}
