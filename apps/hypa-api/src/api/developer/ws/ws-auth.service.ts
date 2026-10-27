import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import argon2 from 'argon2';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { DbService } from 'src/libs/db/db.service';
import { Debug } from 'src/utils/debug';

interface WsAuthResult {
  userId: string;
  apiKeyId: string;
}

@Injectable()
export class WsAuthService {
  constructor(
    private readonly db: DbService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async validate(apiKey: string | undefined): Promise<WsAuthResult | null> {
    if (!apiKey) return null;
    const result = await this.verifyApiKeyCached(apiKey);
    if (!result.isValid || !result.userId || !result.id) return null;
    return { userId: result.userId, apiKeyId: result.id };
  }

  private async verifyApiKeyCached(
    apiKey: string,
  ): Promise<{ isValid: boolean; userId?: string; id?: string }> {
    const keyIndex = createHash('sha256').update(apiKey).digest('hex');
    const cacheKey = `api_key_valid:${keyIndex}`;

    const cached = await this.cacheManager.get<{
      isValid: boolean;
      userId?: string;
      id?: string;
    }>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const storedKey = await this.db.api_key.findFirst({
        where: {
          key_index: keyIndex,
          is_deleted: false,
        },
        select: {
          userId: true,
          id: true,
          key: true,
        },
      });

      let result: { isValid: boolean; userId?: string; id?: string };
      if (!storedKey) {
        result = { isValid: false };
      } else {
        const valid = await this.verifyApiKey(apiKey, String(storedKey.key));
        result = valid
          ? { isValid: true, userId: storedKey.userId, id: storedKey.id }
          : { isValid: false };
      }

      const ttl = result.isValid ? 30 * 60 * 1000 : 60 * 1000;
      await this.cacheManager.set(cacheKey, result, ttl);
      return result;
    } catch (error) {
      Debug.error('Error verifying API key from database', String(error));
      const result = { isValid: false };
      await this.cacheManager.set(cacheKey, result, 60 * 1000);
      return result;
    }
  }

  private async verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, apiKey);
    } catch {
      Debug.error('Error verifying API key');
      return false;
    }
  }
}
