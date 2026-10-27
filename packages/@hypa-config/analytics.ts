import analytics from "./json/analytics.json" with { type: "json" };

export const ANALYTICS = analytics;

type AnalyticsDimension = "products" | "surfaces" | "features";

export function normalizeDimension(
  dimension: AnalyticsDimension,
  value: unknown,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const clean = value.trim().toLowerCase();

  return (analytics[dimension] as string[]).includes(clean)
    ? clean
    : analytics.defaults.unknown;
}

export function capabilityForRequestType(type: string): string | undefined {
  return (analytics.capabilityByRequestType as Record<string, string>)[type];
}

export type AnalyticsApp = keyof typeof analytics.apps;

interface AnalyticsRequestOptions {
  feature?: string;
  workflowId?: string;
  anonId?: string;
}

export function analyticsHeaders(
  app: AnalyticsApp,
  appVersion?: string,
  { feature, workflowId, anonId }: AnalyticsRequestOptions = {},
): Record<string, string> {
  const { headers } = analytics;
  const { product, surface } = analytics.apps[app];
  const entries: [string, string | undefined][] = [
    [headers.product, product],
    [headers.surface, surface],
    [headers.appVersion, appVersion],
    [headers.feature, feature],
    [headers.workflowId, workflowId],
    [headers.anonId, anonId],
  ];

  return Object.fromEntries(entries.filter(([, value]) => value)) as Record<string, string>;
}
