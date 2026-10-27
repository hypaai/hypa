export const ANALYTICS = {
  events: {
    appOpened: "app_opened",
  },
  headers: {
    product: "x-hypa-product",
    surface: "x-hypa-surface",
    anonId: "x-hypa-anon-id",
    appVersion: "x-hypa-app-version",
  },
  apps: {
    "hypa-intelligence-mobile": { product: "intelligence", surface: "mobile" },
  },
} as const;

export type AnalyticsApp = keyof typeof ANALYTICS.apps;

export function analyticsHeaders(app: AnalyticsApp, appVersion?: string): Record<string, string> {
  const { headers } = ANALYTICS;
  const { product, surface } = ANALYTICS.apps[app];
  const entries: [string, string | undefined][] = [
    [headers.product, product],
    [headers.surface, surface],
    [headers.appVersion, appVersion],
  ];

  return Object.fromEntries(entries.filter(([, value]) => value)) as Record<string, string>;
}
