import { BadRequestException, Logger } from '@nestjs/common';
import errorCodes from '@hypa/config/json/error-codes';

const logger = new Logger('TtsPayload');

export function assertTtsPayloadUsable(data: unknown): void {
  const detail = (data as { error?: unknown })?.error;
  if (typeof detail !== 'string' || !detail) return;

  logger.warn(`TTS provider refused the request: ${detail}`);
  if (/exceeds budget|max_model_len - max_new_tokens/i.test(detail)) {
    throw new BadRequestException({
      message: errorCodes.TOKEN_BUDGET_EXCEEDED.message,
      code: errorCodes.TOKEN_BUDGET_EXCEEDED.code,
      reasons: errorCodes.TOKEN_BUDGET_EXCEEDED.reasons,
    });
  }
  throw new BadRequestException({
    message: errorCodes.INCOMPLETE_RESPONSE.message,
    code: errorCodes.INCOMPLETE_RESPONSE.code,
  });
}
