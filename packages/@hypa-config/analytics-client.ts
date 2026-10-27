import { ANALYTICS, type AnalyticsApp } from "./analytics";

export interface PostHogLike {
  init(key: string, options: Record<string, unknown>): unknown;
  register(properties: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string): void;
  reset(): void;
  get_distinct_id(): string;
}

interface AnalyticsClientConfig {
  app: AnalyticsApp;
  appVersion?: string;
  environment: string;
  key?: string;
  host?: string;
}

export function createAnalytics(
  posthog: PostHogLike,
  { app, appVersion, environment, key, host }: AnalyticsClientConfig,
) {
  const enabled = Boolean(key);
  let userId: string | null = null;

  return {
    enabled,

    start() {
      if (!enabled) return;
      const { product, surface } = ANALYTICS.apps[app];

      posthog.init(key as string, {
        api_host: host ?? "https://us.i.posthog.com",
        loaded: (client: PostHogLike) => {
          client.register({ product, surface, app_version: appVersion, environment });
          client.capture(ANALYTICS.events.appOpened);
        },
      });
    },

    appOpened() {
      if (enabled) posthog.capture(ANALYTICS.events.appOpened);
    },

    syncUser(id: string | null | undefined) {
      if (!enabled) return;
      const next = id || null;

      if (next === userId) return;
      if (next) posthog.identify(next);
      else posthog.reset();
      userId = next;
    },

    anonId(): string | undefined {
      return enabled && !userId ? posthog.get_distinct_id() : undefined;
    },
  };
}
