import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { PostHog } from 'posthog-node';
import { DbService } from 'src/libs/db/db.service';
import { Debug } from 'src/utils/debug';
import {
  ALLOWED_PROPERTIES,
  isInternalEmail,
  parseDomains,
  parseEmails,
} from './usage-event';

interface CaptureParams {
  event: string;
  distinctId: string;
  userId?: string;
  properties: Record<string, unknown>;
}

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly client = process.env.POSTHOG_API_KEY
    ? new PostHog(process.env.POSTHOG_API_KEY, {
        host: process.env.POSTHOG_HOST,
      })
    : null;
  private readonly internalDomains = parseDomains(
    process.env.INTERNAL_EMAIL_DOMAINS,
  );
  private readonly internalEmails = parseEmails(process.env.INTERNAL_EMAILS);

  constructor(private readonly db: DbService) {
    const logger = new Logger(AnalyticsService.name);

    if (!this.client) {
      logger.log('PostHog tracking is off: POSTHOG_API_KEY is not set');

      return;
    }
    logger.log(
      `PostHog tracking is on (${process.env.POSTHOG_HOST ?? 'default US host'})`,
    );
    this.client.on('error', (error) =>
      Debug.error('PostHog delivery failed', error),
    );
  }

  async capture({ event, distinctId, userId, properties }: CaptureParams) {
    if (!this.client || !distinctId) return;
    try {
      const isInternal = userId ? await this.isInternal(userId) : false;
      const traceId = trace.getActiveSpan()?.spanContext().traceId;
      const allowed = Object.fromEntries(
        Object.entries({ trace_id: traceId, ...properties }).filter(
          ([key, value]) => ALLOWED_PROPERTIES.has(key) && value !== undefined,
        ),
      );

      this.client.capture({
        distinctId,
        event,
        properties: {
          ...allowed,
          is_internal: isInternal,
          $set: { is_internal: isInternal },
        },
      });
    } catch (error) {
      Debug.error('PostHog capture failed', error);
    }
  }

  private async isInternal(userId: string): Promise<boolean> {
    if (!this.internalDomains.length && !this.internalEmails.length) {
      return false;
    }
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    return isInternalEmail(
      user?.email,
      this.internalDomains,
      this.internalEmails,
    );
  }

  async onModuleDestroy() {
    await this.client?.shutdown();
  }
}
