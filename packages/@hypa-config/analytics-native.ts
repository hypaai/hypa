import type { PostHogLike } from "./analytics-client";

export interface NativePostHogClient {
  register(properties: Record<string, unknown>): void | Promise<void>;
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string): void;
  reset(): void;
  getDistinctId(): string;
}

export function nativePostHog(create: (key: string, host: string) => NativePostHogClient): PostHogLike {
  let client: NativePostHogClient | undefined;
  const adapter: PostHogLike = {
    init(key, options) {
      client = create(key, String(options.api_host));
      (options.loaded as ((posthog: PostHogLike) => void) | undefined)?.(adapter);
    },
    register: (properties) => void client?.register(properties),
    capture: (event, properties) => client?.capture(event, properties),
    identify: (id) => client?.identify(id),
    reset: () => client?.reset(),
    get_distinct_id: () => client?.getDistinctId() ?? "",
  };

  return adapter;
}

export function reopenTracker(onOpen: () => void, minAwayMs = 30 * 60 * 1000, now: () => number = Date.now) {
  let leftAt: number | null = null;

  return (state: string) => {
    if (state === "active") {
      if (leftAt !== null && now() - leftAt >= minAwayMs) onOpen();
      leftAt = null;
    } else if (leftAt === null) {
      leftAt = now();
    }
  };
}
