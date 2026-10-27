export const HER_VERSION = "1";

const HER_WEIGHTS = {
  chrf: 0.3,
  bleu: 0.25,
  meteor: 0.25,
  cer: 0.12,
  wer: 0.08,
} as const;

type HerMetricKey = keyof typeof HER_WEIGHTS;

const ERROR_METRICS = new Set<HerMetricKey>(["wer", "cer"]);

const toError = (key: HerMetricKey, value: number): number =>
  ERROR_METRICS.has(key) ? Math.min(value, 1) : 1 - value;

export function herScore(
  m: Partial<Record<HerMetricKey, number>>,
): number | null {
  const keys = Object.keys(HER_WEIGHTS) as HerMetricKey[];

  if (!keys.every((key) => typeof m[key] === "number")) return null;

  return keys.reduce(
    (sum, key) => sum + HER_WEIGHTS[key] * toError(key, m[key] as number),
    0,
  );
}
