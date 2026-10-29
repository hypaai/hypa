import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import { DbModule } from './libs/db/db.module';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  THROTTLE_BLOCK_DURATION,
  THROTTLE_LIMIT,
  THROTTLE_TTL,
} from './app.constant';
import { JwtGlobalModule } from './libs/shared/jwt.global.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { ConfigService } from '@nestjs/config';
import { QueueModule } from './queues/queue.module';

function getRedisUrl(configService: ConfigService) {
  const configuredUrl = configService.get<string>('REDIS_URL')?.trim();
  const password = configService.get<string>('REDIS_PASSWORD')?.trim();
  const username = configService.get<string>('REDIS_USERNAME')?.trim();
  const db = configService.get<string>('REDIS_DB')?.trim();

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      if (username && !url.username) {
        url.username = username;
      }
      if (password && !url.password) {
        url.password = password;
      }
      if (db && (!url.pathname || url.pathname === '/')) {
        url.pathname = `/${db}`;
      }
      return url.toString();
    } catch {
      return configuredUrl;
    }
  }

  const host = configService.get<string>('REDIS_HOST')?.trim() || 'localhost';
  const port = configService.get<string>('REDIS_PORT')?.trim() || '6379';
  const protocol =
    configService.get<string>('REDIS_TLS') === 'true' ? 'rediss' : 'redis';
  const url = new URL(`${protocol}://${host}:${port}`);

  if (username) {
    url.username = username;
  }
  if (password) {
    url.password = password;
  }
  if (db) {
    url.pathname = `/${db}`;
  }

  return url.toString();
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: THROTTLE_TTL,
          blockDuration: THROTTLE_BLOCK_DURATION,
          limit: THROTTLE_LIMIT,
        },
      ],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = getRedisUrl(configService);

        return {
          stores: [
            new Keyv({
              store: new CacheableMemory({ ttl: 60000, lruSize: 1000 }),
            }),
            new KeyvRedis(redisUrl),
          ],
        };
      },
    }),
    JwtGlobalModule,
    ApiModule,
    QueueModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: getRedisUrl(configService),
          autoResubscribe: true,
          offlineQueue: true,
          lazyConnect: true,
        },
      }),
    }),
    DbModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
