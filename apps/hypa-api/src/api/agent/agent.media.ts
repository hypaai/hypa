import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { StorageService } from 'src/libs/shared/storage.service';
import { mediaSecret, mediaUrl } from './media-url';

export const MCP_MEDIA_OWNER = 'mcp';
export const MCP_AUDIO_PATH = '/v2/mcp/audio';

export interface MediaBlobStore {
  save(key: string, bytes: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

export class MemoryBlobStore implements MediaBlobStore {
  private readonly files = new Map<string, Buffer>();

  async save(key: string, bytes: Buffer) {
    this.files.set(key, bytes);
  }

  async read(key: string) {
    return this.files.get(key) ?? null;
  }

  async remove(key: string) {
    this.files.delete(key);
  }
}

export class FirebaseBlobStore implements MediaBlobStore {
  constructor(private readonly storage: StorageService) {}

  async save(key: string, bytes: Buffer) {
    const { folder, id } = splitKey(key);
    await this.storage.upload(id, bytes, 'application/octet-stream', {
      folder,
      ext: '',
    });
  }

  async read(key: string) {
    const { folder, id } = splitKey(key);
    const found = await this.storage.getFile(id, { folder, ext: '' });
    if (!found) return null;
    const stream = this.storage.readStream(id, { folder, ext: '' });
    return readBuffer(stream);
  }

  async remove(key: string) {
    const { folder, id } = splitKey(key);
    await this.storage.remove(id, { folder, ext: '' });
  }
}

function splitKey(key: string) {
  const slash = key.lastIndexOf('/');
  return {
    folder: `agent/${slash >= 0 ? key.slice(0, slash) : 'shared'}`,
    id: slash >= 0 ? key.slice(slash + 1) : key,
  };
}

async function readBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class AgentMediaService {
  constructor(private readonly blobs: MediaBlobStore) {}

  secret(): string {
    return mediaSecret();
  }

  async put(owner: string, bytes: Buffer): Promise<string> {
    const key = `${owner}/${randomUUID()}`;
    await this.blobs.save(key, bytes);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    return this.blobs.read(key);
  }

  url(key: string, now = Date.now()): string {
    return mediaUrl(key, now);
  }

  publicUrl(key: string, now = Date.now()): string {
    return mediaUrl(key, now, MCP_AUDIO_PATH);
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) await this.blobs.remove(key);
  }
}

export function keysFromMessage(message: {
  audio_key?: string | null;
  tool_trace?: unknown;
  attachments?: unknown;
}): string[] {
  const keys: string[] = [];
  if (message.audio_key) keys.push(message.audio_key);
  if (Array.isArray(message.attachments)) {
    for (const item of message.attachments) {
      if (item && typeof item === 'object' && 'key' in item) {
        const key = (item as { key?: unknown }).key;
        if (typeof key === 'string') keys.push(key);
      }
    }
  }
  if (Array.isArray(message.tool_trace)) {
    for (const entry of message.tool_trace) {
      if (entry && typeof entry === 'object' && entry.type === 'audio' && typeof entry.key === 'string') keys.push(entry.key);
    }
  }
  return [...new Set(keys)];
}
