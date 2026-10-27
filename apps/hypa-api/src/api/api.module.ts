import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { FeatureInterceptor } from 'src/libs/analytics/feature.interceptor';
import { AudioModule } from './audio/audio.module';
import { AuthModule } from './auth/auth.module';
import { DeveloperModule } from './developer/developer.module';
import { ProfileModule } from './profile/profile.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { DictionaryModule } from './dictionary/dictionary.module';
import { TranslateModule } from './translate/translate.module';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [
    AiModule,
    AudioModule,
    AuthModule,
    DictionaryModule,
    TranslateModule,
    ProfileModule,
    BookmarkModule,
    DeveloperModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FeatureInterceptor,
    },
  ],
  controllers: [],
})
export class ApiModule {}
