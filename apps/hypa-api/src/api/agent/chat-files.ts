import { BadRequestException } from '@nestjs/common';
import {
  CHAT_FILE_BYTES,
  CHAT_FILE_LIMIT,
  CHAT_FILE_MIMES,
  CHAT_TOTAL_FILE_BYTES,
  type ChatFileInput,
} from '@hypa/config/chat-attachments';
import { detectAudioMime, detectImageMime } from 'src/libs/shared/audio-mime';

export function validateChatFiles(files: ChatFileInput[]): void {
  if (files.length > CHAT_FILE_LIMIT)
    throw new BadRequestException(`Attach at most ${CHAT_FILE_LIMIT} files.`);
  let total = 0;
  for (const file of files) {
    if (!file.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data))
      throw new BadRequestException('Invalid file encoding.');
    const bytes = Buffer.from(file.data, 'base64');
    if (!bytes.length || bytes.length > CHAT_FILE_BYTES)
      throw new BadRequestException('Each file must be 5 MB or smaller.');
    total += bytes.length;
    if (
      !CHAT_FILE_MIMES.includes(file.mime) ||
      (detectImageMime(bytes) ?? detectAudioMime(bytes)) !== file.mime
    ) {
      throw new BadRequestException('Use a supported image or audio file.');
    }
    if (!file.name || file.name.length > 255)
      throw new BadRequestException('Invalid filename.');
  }
  if (total > CHAT_TOTAL_FILE_BYTES)
    throw new BadRequestException('Attachments must total 7 MB or less.');
}
