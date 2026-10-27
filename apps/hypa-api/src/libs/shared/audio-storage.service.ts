import { Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import { StorageService, type FileMetadata } from './storage.service';

@Injectable()
export class AudioStorageService {
  constructor(private readonly storage: StorageService) {}

  private readonly FOLDER = 'audio';
  private readonly EXT = '.mp3';

  async store(
    id: string,
    base64Audio: string,
    mimeType = 'audio/mpeg',
  ): Promise<void> {
    const cleanedBase64 = base64Audio.startsWith('data:')
      ? base64Audio.split(',')[1]
      : base64Audio;
    await this.storage.upload(id, cleanedBase64, mimeType, {
      folder: this.FOLDER,
      ext: this.EXT,
    });
  }

  async getMetadata(id: string): Promise<FileMetadata | null> {
    return this.storage.getFile(id, {
      folder: this.FOLDER,
      ext: this.EXT,
    });
  }

  createReadStream(
    id: string,
    range?: { start: number; end: number },
  ): Readable {
    return this.storage.readStream(id, {
      folder: this.FOLDER,
      ext: this.EXT,
      range,
    });
  }

  generateId(): string {
    return `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
